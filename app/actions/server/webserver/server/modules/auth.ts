import { StringifiedObjectId, EncryptedInstance, EncryptedAccount } from "../../../../../database/db-types";
import { EXPIRE_TIME } from "../../../../../lib/constants";

interface InstanceAuthRepresentation {
	instance: StringifiedObjectId<EncryptedInstance>;
	account: StringifiedObjectId<EncryptedAccount>;
	exprires: number;
}

export class WebserverAuth {
	private _usedTokens: Set<string> = new Set();
	private _expiredTokens: Set<string> = new Set();
	private _loginTokens: Map<string, InstanceAuthRepresentation> = new Map();
	private _twofactorTokens: Map<string, InstanceAuthRepresentation> = new Map();
	private readonly _chars = 
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890';

	constructor() { }

	private _genRandomToken(): string {
		let str = '';
		for (let i = 0; i < 256; i++) {
			str += this._chars[Math.floor(Math.random() * this._chars.length)];
		}

		if (this._usedTokens.has(str)) {
			return this._genRandomToken();
		}
		this._usedTokens.add(str);
		return str;
	}

	private _clearExpiredTokens() {
		this._loginTokens.forEach(({ exprires }, key) => {
			if (Date.now() > exprires) {
				this._expiredTokens.add(key);
				this._loginTokens.delete(key);
			}
		});
		this._twofactorTokens.forEach(({ exprires }, key) => {
			if (Date.now() > exprires) {
				this._twofactorTokens.delete(key);
			}
		});
	}

	public genLoginToken(instance: StringifiedObjectId<EncryptedInstance>,
		account: StringifiedObjectId<EncryptedAccount>) {
			const token = this._genRandomToken();
			this._loginTokens.set(token, {
				instance,
				account,
				exprires: Date.now() + EXPIRE_TIME
			});
			return token;
		}

	private _invalidateInstanceTokens(account: StringifiedObjectId<EncryptedAccount>) {
		//Invalidate all tokens awarded to all instances of this account
		for (const [ token, { account: currentAccount } ] of this._loginTokens.entries()) {
			if (account === currentAccount) {
				this._loginTokens.delete(token);
				this._expiredTokens.add(token);
			}
		}

	}

	private _isTokenReused(token: string, account: StringifiedObjectId<EncryptedAccount>) {
		if (this._expiredTokens.has(token)) {
			this._invalidateInstanceTokens(account);
			return true;
		}
		return false;
	}

	public verifyLoginToken(token: string, instance: StringifiedObjectId<EncryptedInstance>) {
			this._clearExpiredTokens();

			const match = this._loginTokens.get(token);
			if (!match) {
				return false;
			}

			return match.instance === instance;
		}

	public extendLoginToken(oldToken: string, instance: StringifiedObjectId<EncryptedInstance>,
		account: StringifiedObjectId<EncryptedAccount>) {
			if (this.verifyLoginToken(oldToken, instance) &&
				!this._isTokenReused(oldToken, account)) {
					//Delete old token
					this._loginTokens.delete(oldToken);
					this._expiredTokens.add(oldToken);

					//Create new token
					return this.genLoginToken(instance, account);
				}
			return false;
		}

	public invalidateToken(token: string, instance: StringifiedObjectId<EncryptedInstance>) {
		if (this.verifyLoginToken(token, instance)) {
			this._loginTokens.delete(token);
			return true;
		}
		return false;
	}

	public genTwofactorToken(instance: StringifiedObjectId<EncryptedInstance>,
		account: StringifiedObjectId<EncryptedAccount>) {
			const token = this._genRandomToken();
			this._twofactorTokens.set(token, {
				instance,
				account,
				exprires: Date.now() + (1000 * 60 * 5)
			});
			return token;
		}

	public verifyTwofactorToken(token: string, instance: StringifiedObjectId<EncryptedInstance>) {
		this._clearExpiredTokens();

		const match = this._twofactorTokens.get(token);
		if (!match) {
			return false;
		}

		const isValid = match.instance === instance;
		if (isValid) {
			this._twofactorTokens.delete(token);
		}
		return isValid;
	}
}