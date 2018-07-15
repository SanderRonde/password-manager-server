import { Encrypted, Hashed, Padded, MasterPasswordVerificationPadding, MasterPasswordDecryptionpadding, SaltEncrypted, EncryptionAlgorithm } from "../lib/crypto";
import mongo = require('mongodb');

/**
 * A mongo record, has a _id property
 */
export type MongoRecord<T> = T & {
	/**
	 * The ID of this record
	 */
	_id: TypedObjectID<T>;
}

/**
 * An object ID used to index the database
 */
export declare class TypedObjectID<T> extends mongo.ObjectID { 
	constructor(id?: StringifiedObjectId<T>);

	toHexString(): StringifiedObjectId<T>;
}

/**
 * Data encrypted with the database key
 */
export type DatabaseEncrypted<T> = {
	/**
	 * The data that is encrypted
	 */
	data: Encrypted<T, DatabaseKey>;
	/**
	 * The algorithm used
	 */
	algorithm: EncryptionAlgorithm;
}

/**
 * Data encrypted with the database key with added salt
 */
export type DatabaseEncryptedWithSalt<T> = {
	/**
	 * The data that is encrypted
	 */
	data: SaltEncrypted<T, DatabaseKey>;
	/**
	 * The algorithm used
	 */
	algorithm: EncryptionAlgorithm;
}

//Keys
/**
 * The key to decrypt the database
 */
export type DatabaseKey = string;
/**
 * A key used by an account to decrypt their password and to log in
 */
export type MasterPassword = string;
/**
 * The public key of an instance
 */
export type PublicKey = string;
/**
 * A key used to reset an account
 */
export type ResetKey = string;

/**
 * An encrypted user account
 */
export interface EncryptedAccount {
	/**
	 * (encrypted) The email of the user
	 */
	email: string;
	/**
	 * (encrypted) Whether 2FA is enbled
	 */
	twofactor_enabled: DatabaseEncryptedWithSalt<boolean>;
	/**
	 * (encrypted) The 2FA secret used to generate codes
	 */
	twofactor_secret: DatabaseEncryptedWithSalt<string>;
	/**
	 * (encrypted) The master password, padded and hashed
	 */
	pw: DatabaseEncrypted<EncodedString<Hashed<Padded<MasterPassword, 
		MasterPasswordVerificationPadding>>>>;
	/**
	 * (encrypted) A record that can be decrypted with the reset key
	 * in order to reset the master password
	 */
	reset_key: DatabaseEncrypted<EncodedString<{
		/**
		 * The data that is encrypted
		 */
		data: Encrypted<EncodedString<{
			/**
			 * An integrity verification
			 */
			integrity: true;
			/**
			 * The master password
			 */
			pw: MasterPassword;
		}>, ResetKey>;
		/**
		 * The algorithm used to encrypt the data
		 */
		algorithm: EncryptionAlgorithm;
	}>>;
	/**
	 * (encrypted) Previous reset_key-master_password combinations
	 *  that can be used to undo a reset
	 */
	reset_reset_keys: DatabaseEncrypted<EncodedString<{
		/**
		 * The data that is encrypted
		 */
		data: Encrypted<EncodedString<{
			/**
			 * The data that is encrypted
			 */
			data: Encrypted<EncodedString<{
				/**
				 * An integrity verification
				 */
				integrity: true;
			}>, ResetKey>;
			/**
			 * The algorithm used to encrypt the data
			 */
			algorithm: EncryptionAlgorithm;
		}>, MasterPassword>;
		/**
		 * The algorithm used to encrypt the data
		 */
		algorithm: EncryptionAlgorithm;
	}>>[];
}

/**
 * A decrypted user account
 */
export interface DecryptedAccount {
	/**
	 * The email of the user
	 */
	email: string;
	/**
	 * Whether 2FA is enbled
	 */
	twofactor_enabled: boolean;
	/**
	 * The 2FA secret used to generate codes
	 */
	twofactor_secret: string
	/**
	 * The master password, padded and hashed
	 */
	pw: Hashed<Padded<MasterPassword, MasterPasswordVerificationPadding>>;
	/**
	 * A record that can be decrypted with the reset key
	 * in order to reset the master password
	 */
	reset_key: {
		/**
		 * The data that is encrypted
		 */
		data: Encrypted<EncodedString<{
			/**
			 * An integrity verification
			 */
			integrity: true;
			/**
			 * The master password
			 */
			pw: MasterPassword;
		}>, ResetKey>;
		/**
		 * The algorithm used to encrypt the data
		 */
		algorithm: EncryptionAlgorithm;
	};
	/**
	 * Previous reset_key-master_password combinations
	 *  that can be used to undo a reset
	 */
	reset_reset_keys: {
		/**
		 * The data that is encrypted
		 */
		data: Encrypted<EncodedString<{
			/**
			 * The data that is encrypted
			 */
			data: Encrypted<EncodedString<{
				/**
				 * An integrity verification
				 */
				integrity: true;
			}>, ResetKey>;
			/**
			 * The algorithm used to encrypt the data
			 */
			algorithm: EncryptionAlgorithm;
		}>, MasterPassword>;
		/**
		 * The algorithm used to encrypt the data
		 */
		algorithm: EncryptionAlgorithm;
	}[];
}

/**
 * An encrypted instance (endpoint)
 */
export type EncryptedInstance = {
	/**
	 * (encrypted) Whether 2FA is enabled for this instance's login
	 */
	twofactor_enabled: DatabaseEncryptedWithSalt<boolean>;
	/**
	 * (encrypted) The public key used to encrypt data sent to this instance
	 */
	public_key: DatabaseEncrypted<EncodedString<string>>; 
	/**
	 * (encrypted) The user ID belonging to this account
	 */
	user_id: DatabaseEncrypted<EncodedString<StringifiedObjectId<EncryptedAccount>>>;
};

/**
 * A decrypted instance (endpoint)
 */
export type DecryptedInstance = {
	/**
	 * Whether 2FA is enabled for this instance's login
	 */
	twofactor_enabled: boolean;
	/**
	 * The public key used to encrypt data sent to this instance
	 */
	public_key: string;
	/**
	 * The user ID belonging to this account
	 */
	user_id: StringifiedObjectId<EncryptedAccount>;
}

/**
 * An object ID in string form. Calling new mongo.ObjectID(key) on it
 * creates a mongodb ObjectID again
 */
export type StringifiedObjectId<T> = string & {
	__id: TypedObjectID<T>;
}

/**
 * An encrypted user password
 */
export interface EncryptedPassword {
	/**
	 * (encrypted) The user ID that this password belongs to
	 */
	user_id: TypedObjectID<EncryptedAccount>;
	/**
	 * (encrypted) The websites for which this password is used
	 */
	websites: {
		/**
		 * (encrypted) The hostname of the URL
		 */
		host: DatabaseEncrypted<EncodedString<string>>;
		/**
		 * (encrypted) The full URL
		 */
		exact: DatabaseEncrypted<EncodedString<string>>;
	}[];
	/**
	 * (encrypted) Whether 2FA is enabled for this password
	 */
	twofactor_enabled: DatabaseEncryptedWithSalt<boolean>;
	/**
	 * (encrypted) Data that is encrypted with the user's 
	 * 	master password and as such is inaccessible to the server
	 */
	encrypted: DatabaseEncrypted<EncodedString<{
		/**
		 * The encrypted data
		 */
		data: Encrypted<EncodedString<{
			/**
			 * The username of the website (or group)
			 */
			username: string;
			/**
			 * The password of the website (or group)
			 */
			password: string;
			/**
			 * Any notes about this website (or group)
			 */
			notes: string[];
		}>, Hashed<Padded<MasterPassword, MasterPasswordDecryptionpadding>>>;
		/**
		 * The algorithm used to encrypt the data
		 */
		algorithm: EncryptionAlgorithm;
	}>>;
}

/**
 * A decrypted user password
 */
export interface DecryptedPassword {
	/**
	 * The user ID that this password belongs to
	 */
	user_id: TypedObjectID<EncryptedAccount>;
	/**
	 * The websites for which this password is used
	 */
	websites: {
		/**
		 * The hostname of the URL
		 */
		host: string;
		/**
		 * The full URL
		 */
		exact: string;
	}[];
	/**
	 * Whether 2FA is enabled for this password
	 */
	twofactor_enabled: boolean;
	/**
	 * Data that is encrypted with the user's 
	 * 	master password and as such is inaccessible to the server
	 */
	encrypted: {
		/**
		 * The encrypted data
		 */
		data: Encrypted<EncodedString<{
			/**
			 * The username of the website (or group)
			 */
			username: string;
			/**
			 * The password of the website (or group)
			 */
			password: string;
			/**
			 * Any notes about this website (or group)
			 */
			notes: string[];
		}>, Hashed<Padded<MasterPassword, MasterPasswordDecryptionpadding>>>;
		/**
		 * The algorithm used to encrypt the data
		 */
		algorithm: EncryptionAlgorithm;
	}
}