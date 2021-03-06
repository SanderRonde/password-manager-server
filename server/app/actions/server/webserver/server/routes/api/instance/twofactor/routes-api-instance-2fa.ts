import { StringifiedObjectId, EncryptedInstance, MasterPassword } from '../../../../../../../../../../shared/types/db-types';
import { Hashed, Padded, MasterPasswordVerificationPadding, encryptWithPublicKey } from '../../../../../../../../lib/crypto';
import { TwofactorVerifyToken, APIToken } from "../../../../../../../../../../shared/types/crypto";
import { API_ERRS } from '../../../../../../../../../../shared/types/api';
import { COLLECTIONS } from '../../../../../../../../database/database';
import { ServerResponse } from '../../../../modules/ratelimit';
import { Webserver } from '../../../../webserver';
import * as speakeasy from 'speakeasy'
import * as express from 'express'


export class RoutesAPIInstanceTwofactor {
	constructor(public server: Webserver) { }

	public enable(req: express.Request, res: ServerResponse, next: express.NextFunction) {
		this.server.Router.requireParams<{
			instance_id: StringifiedObjectId<EncryptedInstance>;
		}, {}, {
			password: Hashed<Padded<MasterPassword, MasterPasswordVerificationPadding>>;
		}, {}>({
			unencrypted: ['instance_id'],
			encrypted: ['password']
		}, {}, async (toCheck, { password, instance_id }) => {
			if (!this.server.Router.typeCheck(toCheck, res, [{
				val: 'instance_id',
				type: 'string'
			}, {
				val: 'password',
				type: 'string'
			}])) return;

			const { instance, decryptedInstance, accountPromise } = 
				await this.server.Router.verifyAndGetInstance(instance_id, res, true);
			if (instance === null || decryptedInstance === null || accountPromise === null) return;

			const user = await this.server.database.Manipulation.findOne(COLLECTIONS.USERS, {
				_id: instance.user_id
			});
			if (!user) {
				res.status(200);
				res.json({
					success: false,
					error: 'invalid credentials',
					ERR: API_ERRS.INVALID_CREDENTIALS
				});
				return;
			}

			const auth = await this.server.Router.checkEmailPassword(
				user.email, password, res);
			if (auth === false) return;

			if (decryptedInstance.twofactor_enabled === true) {
				res.status(200);
				res.json({
					success: true,
					data: {
						message: 'state unchanged (was already set)'
					}
				});
				return;
			}

			//Check if a secret already exists
			const { twofactor_secret } = await accountPromise;

			if (!twofactor_secret) {
				//Create a new one
				const secret = speakeasy.generateSecret({
					name: 'Password Manager',
					length: 64
				});
	
				if (await this.server.database.Manipulation.findAndUpdateOne(COLLECTIONS.USERS, {
					_id: instance.user_id
				}, {
					twofactor_secret: this.server.database.Crypto.dbEncryptWithSalt(secret.ascii),
					twofactor_enabled: this.server.database.Crypto.dbEncryptWithSalt(false)
				}) === null) {
					res.status(500);
					res.json({
						success: false,
						error: 'failed to update record',
						ERR: API_ERRS.SERVER_ERROR
					});
					return;
				}
	
				res.status(200);
				res.json({
					success: true,
					data: {
						enabled: false,
						verify_2fa_required: true,
						auth_url: secret.otpauth_url
					}
				});
			} else {
				//One already exists, allow this
				if (await this.server.database.Manipulation.findAndUpdateOne(COLLECTIONS.INSTANCES, {
					_id: instance._id
				}, {
					twofactor_enabled: this.server.database.Crypto.dbEncryptWithSalt(true)
				}) === null) {
					res.status(500);
					res.json({
						success: false,
						error: 'failed to update record',
						ERR: API_ERRS.SERVER_ERROR
					});
					return;
				}
				res.status(200);
				res.json({
					success: true,
					data: {
						enabled: true
					}
				});
			}
		})(req, res, next);
	}	

	public disable(req: express.Request, res: ServerResponse, next: express.NextFunction) {
		this.server.Router.requireParams<{
			instance_id: StringifiedObjectId<EncryptedInstance>;
			twofactor_token: string;
		}, {}, {
			password: Hashed<Padded<MasterPassword, MasterPasswordVerificationPadding>>;
		}, {}>({
			unencrypted: ['instance_id', 'twofactor_token'],
			encrypted: ['password']
		}, {}, async (toCheck, { password, instance_id, twofactor_token }) => {
			if (!this.server.Router.typeCheck(toCheck, res, [{
				val: 'instance_id',
				type: 'string'
			}, {
				val: 'password',
				type: 'string'
			}, {
				val: 'twofactor_token',
				type: 'string'
			}])) return;

			const { instance, decryptedInstance, accountPromise } = 
				await this.server.Router.verifyAndGetInstance(instance_id, res, true);
			if (instance === null || decryptedInstance === null || accountPromise === null) return;

			const user = await this.server.database.Manipulation.findOne(COLLECTIONS.USERS, {
				_id: instance.user_id
			});
			if (!user) {
				res.status(200);
				res.json({
					success: false,
					error: 'invalid credentials',
					ERR: API_ERRS.INVALID_CREDENTIALS
				});
				return;
			}

			const auth = await this.server.Router.checkEmailPassword(
				user.email, password, res);
			if (auth === false) return;

			const { twofactor_secret } = await accountPromise
			if (decryptedInstance.twofactor_enabled === false || twofactor_secret === null) {
				res.status(200);
				res.json({
					success: true,
					data: {
						message: 'state unchanged (was already set)'
					}
				});
				return;
			};

			if (!this.server.Router.verify2FA(twofactor_secret, twofactor_token)) {
				res.status(200);
				res.json({
					success: false,
					error: 'invalid token',
					ERR: API_ERRS.INVALID_CREDENTIALS
				});
				return;
			}

			if (!await this.server.database.Manipulation.findAndUpdateOne(COLLECTIONS.INSTANCES, {
				_id: instance._id
			}, {
				twofactor_enabled: this.server.database.Crypto.dbEncryptWithSalt(false)
			})) {
				res.status(500);
				res.json({
					success: false,
					error: 'failed to update record',
					ERR: API_ERRS.SERVER_ERROR
				});
				return;
			}
			res.status(200);
			res.json({
				success: true,
				data: {
					disabled: true
				}
			});
		})(req, res, next);
	}

	public confirm(req: express.Request, res: ServerResponse, next: express.NextFunction) {
		this.server.Router.requireParams<{
			instance_id: StringifiedObjectId<EncryptedInstance>;
			twofactor_token: string;
		}, {}, {}, {}>({
			unencrypted: ['instance_id', 'twofactor_token']
		}, {}, async (toCheck, { instance_id, twofactor_token }) => {
			if (!this.server.Router.typeCheck(toCheck, res, [{
				val: 'instance_id',
				type: 'string'
			}, {
				val: 'twofactor_token',
				type: 'string'
			}])) return;

			const { instance, decryptedInstance, accountPromise } = 
				await this.server.Router.verifyAndGetInstance(instance_id, res);
			if (instance === null || decryptedInstance === null || accountPromise === null) return;
			const { twofactor_secret } = await accountPromise;

			if (twofactor_secret === null) {
				res.status(200);
				res.json({
					success: false,
					error: 'invalid token',
					ERR: API_ERRS.INVALID_CREDENTIALS
				});
				return;
			}

			if (this.server.Router.verify2FA(twofactor_secret, twofactor_token)) {
				//This is an attempt to verify a 2FA secret after adding it
				if (!decryptedInstance.twofactor_enabled) {
					//Enable it
					if (!await this.server.database.Manipulation.findAndUpdateOne(COLLECTIONS.INSTANCES, {
						_id: instance._id
					}, {
						twofactor_enabled: this.server.database.Crypto.dbEncryptWithSalt(true)
					})) {
						res.status(500);
						res.json({
							success: false,
							error: 'failed to update record',
							ERR: API_ERRS.SERVER_ERROR
						});
						return;
					}
				}
				res.status(200);
				res.json({
					success: true,
					data: {}
				});
			} else {
				res.status(200);
				res.json({
					success: false,
					error: 'invalid token',
					ERR: API_ERRS.INVALID_CREDENTIALS
				});
			}
		})(req, res, next);
	}

	public verify(req: express.Request, res: ServerResponse, next: express.NextFunction) {
		this.server.Router.requireParams<{
			instance_id: StringifiedObjectId<EncryptedInstance>;
			twofactor_token: string;
			pw_verification_token: TwofactorVerifyToken;
		}, {}, {}, {}>({
			unencrypted: ['instance_id', 'twofactor_token', 'pw_verification_token']
		}, {}, async (toCheck, { instance_id, twofactor_token, pw_verification_token }) => {
			if (!this.server.Router.typeCheck(toCheck, res, [{
				val: 'instance_id',
				type: 'string'
			}, {
				val: 'twofactor_token',
				type: 'string'
			}, {
				val: 'pw_verification_token',
				type: 'string'
			}])) return;

			const { instance, accountPromise } = 
				await this.server.Router.verifyAndGetInstance(instance_id, res);
			if (instance === null || accountPromise === null) return;
			const { twofactor_secret } = await accountPromise;

			if (twofactor_secret === null) {
				res.status(200);
				res.json({
					success: false,
					error: 'invalid token',
					ERR: API_ERRS.INVALID_CREDENTIALS
				});
				return;
			}

			const publicKey = this.server.database.Crypto.dbDecrypt(instance.public_key);
			if (this.server.Auth.verifyTwofactorToken(pw_verification_token, instance_id)) {
				if (this.server.Router.verify2FA(twofactor_secret, twofactor_token)) {
				//This is a login attempt
					res.status(200);
					res.json({
						success: true,
						data: {
							auth_token: encryptWithPublicKey(
								this.server.Auth.genLoginToken(instance_id, 
								instance.user_id.toHexString()), publicKey)
						}
					});
				} else {
					res.status(200);
					res.json({
						success: false,
						error: 'invalid token',
						ERR: API_ERRS.INVALID_CREDENTIALS
					});
				}
			} else {
				res.status(200);
				res.json({
					success: false,
					error: 'invalid token',
					ERR: API_ERRS.INVALID_CREDENTIALS
				});
			}
		})(req, res, next);
	}

	public isSetup(req: express.Request, res: ServerResponse, next: express.NextFunction) {
		this.server.Router.requireParams<{
			instance_id: StringifiedObjectId<EncryptedInstance>;
		}, {}, {
			count: number;
			token: APIToken;
		}, {}>({
			unencrypted: ['instance_id'],
			encrypted: ['token', 'count']
		}, {}, async (toCheck, { instance_id, token, count }) => {
			if (!this.server.Router.typeCheck(toCheck, res, [{
				val: 'instance_id',
				type: 'string'
			}, {
				val: 'token',
				type: 'string'
			}, {
				val: 'count',
				type: 'number'
			}])) return;

			const { instance, accountPromise } = 
				await this.server.Router.verifyAndGetInstance(instance_id, res);
			if (instance === null || accountPromise === null) return;
			const { twofactor_secret } = await accountPromise;

			if (!this.server.Router.verifyLoginToken(token, count, instance_id, res, true)) return;

			res.status(200);
			res.json({
				success: true,
				data: {
					enabled: twofactor_secret !== null
				}
			});
		})(req, res, next);
	}
}