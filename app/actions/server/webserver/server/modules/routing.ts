import { MongoRecord, EncryptedAccount, EncryptedInstance, StringifiedObjectId, MasterPassword, DatabaseEncrypted } from "../../../../../database/db-types";
import { Hashed, Padded, MasterPasswordVerificationPadding, hash, pad, decryptWithPrivateKey, ERRS } from "../../../../../lib/crypto";
import { getStores, ResponseCaptured, APIResponse } from "./ratelimit";
import { COLLECTIONS } from "../../../../../database/database";
import { API_ERRS } from "../../../../../api";
import { Webserver } from "../webserver";
import speakeasy = require('speakeasy');
import express = require('express');
import mongo = require('mongodb');

type ResponseCapturedRequestHandler = (req: express.Request,
	res: ResponseCaptured, next: express.NextFunction) => any;

type BasicType = 'string'|'boolean'|'number';;
type TypecheckConfig = {
	val: string;
	type: BasicType;
}|{
	val: string;
	type: 'array';
	inner: BasicType;
}

export class WebserverRouter {
	constructor(public parent: Webserver) { 
		this._init();
	}

	private _init() {
		this._register();
	}

	public checkPassword(_req: express.Request, res: ResponseCaptured,
		actualPassword: DatabaseEncrypted<EncodedString<Hashed<Padded<string,
			MasterPasswordVerificationPadding>>>>, 
		expectedPassword: DatabaseEncrypted<EncodedString<Hashed<Padded<string,
			MasterPasswordVerificationPadding>>>>) {
				if (actualPassword !== expectedPassword) {
					res.status(200);
					res.json({
						success: false,
						error: 'invalid credentials',
						ERR: API_ERRS.INVALID_CREDENTIALS
					});
					return false;
				}
				return true;
			}

	public async checkPasswordFromBody(req: express.Request, res: ResponseCaptured, 
		supressErr: boolean = false): Promise<false|MongoRecord<EncryptedAccount>> {
			const { email, password } = req.body as {
				email: string;
				password: Hashed<Padded<MasterPassword, MasterPasswordVerificationPadding>>;
			};
			if (!email || !password) {
				res.status(400);
				return false;
			}

			//Check if an account with that email exists
			if (!await this.parent.database.Manipulation.findOne(
				COLLECTIONS.USERS, {
					email: this.parent.database.Crypto.dbEncrypt(email)
				})) {
					res.status(400);
					res.json({
						success: false,
						error: 'Incorrect combination',
						ERR: API_ERRS.INVALID_CREDENTIALS
					});
					return false;
				}

			//Check if the password is correct
			const record = await this.parent.database.Manipulation.findOne(
				COLLECTIONS.USERS, {
					email: this.parent.database.Crypto.dbEncrypt(email)
				});
			
				pw: this.parent.database.Crypto.dbEncrypt(password)

			if (this.parent.database.Crypto.dbDecrypt(record.pw) === 
				hash(pad(password, 'masterpwverify'))) {
					if (!supressErr) {
						res.status(400);
						res.json({
							success: false,
							error: 'Incorrect combination',
							ERR: API_ERRS.INVALID_CREDENTIALS
						});
					}
					return false;
				}
			return record;
		}

	private async _getInstance(id: StringifiedObjectId<EncryptedInstance>) {
		const objectId = new mongo.ObjectId(id);
		return await this.parent.database.Manipulation.findOne(COLLECTIONS.INSTANCES, {
			_id: objectId
		});
	}

	public verify2FA(secret: string, key: string) {
		if (!secret) {
			return false;
		}
		return speakeasy.totp.verify({
			secret: secret,
			encoding: 'base32',
			token: key,
			window: 6
		});
	}

	public requireParams<R extends {
		instance_id: StringifiedObjectId<EncryptedInstance>;
		[key: string]: any;
	}, O extends {
		[key: string]: any;
	} = {}, E extends {
		[key: string]: any;
	} = {}, OE extends {
		[key: string]: any;
	} = {}>(requiredParams: (keyof R|keyof E)[], 
		optionalParams: (keyof O|keyof OE)[]|string[], 
		handler: (req: express.Request, res: ResponseCaptured, 
			params: R & E & Partial<O> & Partial<OE>) => void): ResponseCapturedRequestHandler
	public requireParams<R extends {
		[key: string]: any;
	}, O extends {
		[key: string]: any;
	} = {}, E extends {
		[key: string]: any;
	} = {}, OE extends {
		[key: string]: any;
	} = {}>(requiredParams: (keyof R)[], 
		optionalParams: (keyof O|keyof OE)[]|string[], 
		handler: (req: express.Request, res: ResponseCaptured, 
			params: R & E & Partial<O> & Partial<OE>) => void): ResponseCapturedRequestHandler;
	public requireParams<R extends {
		[key: string]: any;
	}, O extends {
		[key: string]: any;
	} = {}, E extends {
		[key: string]: any;
	} = {}, OE extends {
		[key: string]: any;
	} = {}>(requiredParams: (keyof R|keyof E)[], 
		optionalParams: (keyof O|keyof OE)[]|string[], 
		handler: (req: express.Request, res: ResponseCaptured, 
			params: R & E & Partial<O> & Partial<OE>) => void): ResponseCapturedRequestHandler {
				return async (req, res) => {
					let toCheckSrc: any & R & E = {...req.body};

					if (!req.body) {
						res.status(400);
						res.json({
							success: false,
							error: 'no request body',
							ERR: API_ERRS.NO_REQUEST_BODY
						});
						return;
					}

					//Decrypt encrypted params
					if (req.body.encrypted) {
						if (!req.body.instance_id) {
							res.status(400);
							res.json({
								success: false,
								error: 'missing parameters',
								ERR: API_ERRS.MISSING_PARAMS
							});
							return;
						}

						const instance = await this.parent.database.Manipulation.findOne(
							COLLECTIONS.INSTANCES, {
								_id: new mongo.ObjectId(req.body.instance_id)
							});
						if (!instance) {
							res.status(400);
							res.json({
								success: false,
								error: 'missing parameters',
								ERR: API_ERRS.MISSING_PARAMS
							});
							return;
						}

						const privateKey = this.parent.database.Crypto.dbDecrypt(
							instance.server_private_key);
						const decrypted = decryptWithPrivateKey(req.body.encrypted,
							privateKey);
						if (decrypted === ERRS.INVALID_DECRYPT) {
							res.status(400);
							res.json({
								success: false,
								error: 'missing parameters',
								ERR: API_ERRS.MISSING_PARAMS
							});
							return;
						}
						toCheckSrc = {...toCheckSrc, ...decrypted};
					}

					const values: R & O & E & OE = {} as R & O & E & OE;
					for (const key of requiredParams) {
						if (toCheckSrc[key] === undefined || toCheckSrc[key] === null) {
							res.status(400);
							res.json({
								success: false,
								error: 'missing parameters',
								ERR: API_ERRS.MISSING_PARAMS
							});
							return;
						}
						values[key] = toCheckSrc[key];
					}
					for (const key of optionalParams) {
						values[key] = req.body[key];
					}

					handler(req, res, values);
				}
			}

	public async verifyAndGetInstance(instanceId: StringifiedObjectId<EncryptedInstance>, res: ResponseCaptured) {
		const instance = await this._getInstance(instanceId);
		if (!instance) {
			res.status(400);
			res.json({
				success: false,
				error: 'invalid instance ID',
				ERR: API_ERRS.INVALID_CREDENTIALS
			});
			return { instance: null, decryptedInstance: null, accountPromise: null };
		}
		const decryptedInstance = this.parent.database.Crypto
			.dbDecryptInstanceRecord(instance);
		const _this = this;
		return { 
			instance, 
			decryptedInstance,
			get accountPromise() {
				return (async() => {
					return _this.parent.database.Crypto.dbDecryptAccountRecord(
						await _this.parent.database.Manipulation.findOne(
							COLLECTIONS.USERS, {
								_id: new mongo.ObjectId(decryptedInstance.user_id)
							}));
				})();
			}
		};
	}

	public verifyLoginToken(token: string, instanceId: StringifiedObjectId<EncryptedInstance>, res: ResponseCaptured) {
		if (!this.parent.Auth.verifyLoginToken(token, instanceId)) {
			res.status(200);
			res.json({
				success: false,
				error: 'invalid token',
				ERR: API_ERRS.INVALID_CREDENTIALS
			});
			return false;
		}
		return true;
	}

	private _printTypeErr(res: ResponseCaptured, val: string, type: BasicType|'array', inner?: BasicType) {
		if (inner) {
			res.status(400);
			res.json({
				success: false,
				error: `param "${val}" not of type ${type}[]`,
				ERR: API_ERRS.INVALID_PARAM_TYPES
			});
		} else {
			res.status(400);
			res.json({
				success: false,
				error: `param "${val}" not of type ${type}`,
				ERR: API_ERRS.INVALID_PARAM_TYPES
			});
		}
	}

	public typeCheck(req: express.Request, res: ResponseCaptured, configs: TypecheckConfig[]) {
		const body = req.body;
		for (const config of configs) {
			const { val, type } = config;
			if (!(val in body)) {
				continue;
			}
			const value = body[val];
			switch (config.type) {
				case 'boolean':
				case 'number':
				case 'string':
					if (typeof value !== type) {
						this._printTypeErr(res, val, type);
						return false;
					}
					break;
				case 'array':
					if (!Array.isArray(value)) {
						this._printTypeErr(res, val, type);
						return false;
					} else {
						for (const item of value) {
							if (typeof item !== config.inner) {
								this._printTypeErr(res, val, type, config.inner);
								return false;
							}
						}
					}
					break;
			}
		}
		return true;
	}

	private _wrapInErrorHandler(fn: (req: express.Request, res: ResponseCaptured, next: express.NextFunction) => any) {
		return (req: express.Request, res: ResponseCaptured, next: express.NextFunction) => {
			try {
				fn(req, res, next);
			} catch(e) {
				res.status(500);
				res.json({
					success: false,
					error: 'server error',
					ERR: API_ERRS.SERVER_ERROR
				});
			}
		}
	}

	private _register() {
		this.parent.app.enable('trust proxy');

		//Main entrypoint
		this.parent.app.get('/', this.parent.Routes.Dashboard.index);
		this.parent.app.get('/login', this.parent.Routes.Dashboard.login);
		this.parent.app.get('/dashboard', this.parent.Routes.Dashboard.dashboard);

		this.parent.app.use((_req: express.Request, res: ResponseCaptured, next) => {
			const originalFn = res.json;
			res.json = (response: APIResponse) => {
				res.__jsonResponse = response;
				return originalFn(response);
			}
			next();
		});

		const { 
			apiUseLimiter, 
			instanceCreateLimiter, 
			bruteforceLimiter 
		} = getStores(this.parent.config);

		//API
		this.parent.app.post('/api/instance/register', bruteforceLimiter,
			instanceCreateLimiter, this._wrapInErrorHandler(
				this.parent.Routes.API.Instance.register));
		this.parent.app.post('/api/instance/login', bruteforceLimiter,
			instanceCreateLimiter, this._wrapInErrorHandler(
				this.parent.Routes.API.Instance.login));
		this.parent.app.post('/api/instance/logout', bruteforceLimiter,
			instanceCreateLimiter, this._wrapInErrorHandler(
				this.parent.Routes.API.Instance.logout));
		this.parent.app.post('/api/instance/extend_key', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this.parent.Routes.API.Instance.extendKey));

		this.parent.app.post('/api/instance/2fa/enable', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this.parent.Routes.API.Instance.Twofactor.enable));
		this.parent.app.post('/api/instance/2fa/disable', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this.parent.Routes.API.Instance.Twofactor.disable));
		this.parent.app.post('/api/instance/2fa/confirm', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this.parent.Routes.API.Instance.Twofactor.confirm));
		this.parent.app.post('/api/instance/2fa/verify', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this.parent.Routes.API.Instance.Twofactor.verify));

		this.parent.app.post('/api/password/set', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this.parent.Routes.API.Password.set));
		this.parent.app.post('/api/password/update', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this.parent.Routes.API.Password.update));
		this.parent.app.post('/api/password/remove', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this.parent.Routes.API.Password.remove));
		this.parent.app.post('/api/password/get', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this.parent.Routes.API.Password.get));
		this.parent.app.post('/api/password/getmeta', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this.parent.Routes.API.Password.getmeta));
		this.parent.app.post('/api/password/querymeta', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this.parent.Routes.API.Password.querymeta));
		this.parent.app.post('/api/password/allmeta', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this.parent.Routes.API.Password.allmeta));

		this.parent.app.post('/api/user/reset', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this.parent.Routes.API.Account.reset));
		this.parent.app.post('/api/user/undoreset', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this.parent.Routes.API.Account.undoreset));
		this.parent.app.post('/api/user/genresetkey', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this.parent.Routes.API.Account.regenkey));
	}
}