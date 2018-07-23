import { MongoRecord, EncryptedAccount, EncryptedInstance, StringifiedObjectId, MasterPassword } from "../../../../../database/db-types";
import { Hashed, Padded, MasterPasswordVerificationPadding, decryptWithPrivateKey, ERRS } from "../../../../../lib/crypto";
import { getStores, ResponseCaptured, APIResponse } from "./ratelimit";
import { COLLECTIONS } from "../../../../../database/database";
import { API_ERRS } from "../../../../../api";
import { Webserver } from "../webserver";
import speakeasy = require('speakeasy');
import { APIToken } from "./auth";
import express = require('express');
import mongo = require('mongodb');

type ResponseCapturedRequestHandler = (req: express.Request,
	res: ResponseCaptured, next: express.NextFunction) => any;

type BasicType = 'string'|'boolean'|'number';
type TypecheckConfig = {
	val: string;
	type: BasicType;
}|{
	val: string;
	type: 'array';
	inner: BasicType;
}

export class WebserverRouter {
	constructor(public parent: Webserver) { }

	public init() {
		this._register();
	}

	public checkPassword(_req: express.Request, res: ResponseCaptured,
		actualPassword: Hashed<Padded<string, MasterPasswordVerificationPadding>>,
		expectedPassword: Hashed<Padded<string, MasterPasswordVerificationPadding>>) {
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

	public async checkEmailPassword(email: string, 
		password: Hashed<Padded<MasterPassword, MasterPasswordVerificationPadding>>, res: ResponseCaptured, 
		supressErr: boolean = false): Promise<false|MongoRecord<EncryptedAccount>> {
			if (!email || !password) {
				res.status(400);
				res.json({
					success: false,
					error: 'Incorrect combination',
					ERR: API_ERRS.INVALID_CREDENTIALS
				});
				return false;
			}

			//Check if an account with that email exists
			const record = await this.parent.database.Manipulation.findOne(
				COLLECTIONS.USERS, {
					email: email
				});
			if (!record) {
					res.status(400);
					res.json({
						success: false,
						error: 'Incorrect combination',
						ERR: API_ERRS.INVALID_CREDENTIALS
					});
					return false;
				}

			//Check if the password is correct
			
			if (this.parent.database.Crypto.dbDecrypt(record.pw) !== password) {
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
	} = {}>(requiredParams: {
		unencrypted: (keyof R)[];
		encrypted: (keyof E)[];
	}, optionalParams: {
		unencrypted?: (keyof O)[];
		encrypted?: (keyof OE)[];
	}, handler: (toCheckSrc: R & E,
			params: R & E & Partial<O> & Partial<OE>) => void): ResponseCapturedRequestHandler
	public requireParams<R extends {
		[key: string]: any;
	}, O extends {
		[key: string]: any;
	} = {}, E extends {
		[key: string]: any;
	} = {}, OE extends {
		[key: string]: any;
	} = {}>(requiredParams: {
		unencrypted: (keyof R)[];
	}, optionalParams: {
		unencrypted?: (keyof O)[];
	}, handler: (toCheckSrc: R & E,
			params: R & E & Partial<O> & Partial<OE>) => void): ResponseCapturedRequestHandler;
	public requireParams<R extends {
		[key: string]: any;
	}, O extends {
		[key: string]: any;
	} = {}, E extends {
		[key: string]: any;
	} = {}, OE extends {
		[key: string]: any;
	} = {}>(requiredParams: {
		unencrypted: (keyof R)[];
		encrypted?: (keyof E)[];
	}, optionalParams: {
		unencrypted?: (keyof O)[];
		encrypted?: (keyof OE)[];
	}, handler: (toCheckSrc: R & E,
			params: R & E & Partial<O> & Partial<OE>) => void): ResponseCapturedRequestHandler {
				return async (req, res) => {
					const toCheckUnencrypted: R = req.body;
					let toCheckEncrypted: E & OE= {} as E & OE;
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
						toCheckEncrypted = decrypted as E & OE;
						toCheckSrc = {...toCheckSrc, ...decrypted}
					}

					const values: R & O & E & OE = {} as R & O & E & OE;
					for (const key of requiredParams.unencrypted) {
						if (toCheckUnencrypted[key] === undefined || toCheckUnencrypted[key] === null) {
							res.status(400);
							res.json({
								success: false,
								error: `missing parameter ${key}`,
								ERR: API_ERRS.MISSING_PARAMS
							});
							return;
						}
						values[key] = toCheckUnencrypted[key];
					}
					for (const key of requiredParams.encrypted || []) {
						if (toCheckEncrypted[key] === undefined || toCheckEncrypted[key] === null) {
							res.status(400);
							res.json({
								success: false,
								error: `missing parameter ${key}`,
								ERR: API_ERRS.MISSING_PARAMS
							});
							return;
						}
						values[key] = toCheckEncrypted[key];
					}
					for (const key of optionalParams.unencrypted || []) {
						values[key] = req.body[key];
					}
					for (const key of optionalParams.encrypted || []) {
						values[key] = toCheckEncrypted[key];
					}

					handler(toCheckSrc, values);
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
						(await _this.parent.database.Manipulation.findOne(
							COLLECTIONS.USERS, {
								_id: new mongo.ObjectId(decryptedInstance.user_id)
							}))!);
				})();
			}
		};
	}

	public verifyLoginToken(token: APIToken, count: number, 
		instanceId: StringifiedObjectId<EncryptedInstance>, res: ResponseCaptured) {
			if (!this.parent.Auth.verifyAPIToken(token, count, instanceId)) {
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

	public typeCheck(src: any, res: ResponseCaptured, configs: TypecheckConfig[]) {
		for (const config of configs) {
			const { val, type } = config;
			if (!(val in src)) {
				continue;
			}
			const value = src[val];
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

	private _doBind<P extends any, K extends keyof P>(parent: P, key: K) {
		return (parent[key] as Function).bind(parent);
	}

	private _register() {
		this.parent.app.enable('trust proxy');

		//Main entrypoint
		this.parent.app.get('/', 
			this._doBind(this.parent.Routes.Dashboard, 'index'));
		this.parent.app.get('/login', 
			this._doBind(this.parent.Routes.Dashboard, 'login'));
		this.parent.app.get('/dashboard', 
			this._doBind(this.parent.Routes.Dashboard, 'dashboard'));

		this.parent.app.use((_req: express.Request, res: ResponseCaptured, next) => {
			const originalFn = res.json.bind(res);
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
				this._doBind(this.parent.Routes.API.Instance, 'register')));
		this.parent.app.post('/api/instance/login', bruteforceLimiter,
			instanceCreateLimiter, this._wrapInErrorHandler(
				this._doBind(this.parent.Routes.API.Instance, 'login')));
		this.parent.app.post('/api/instance/logout', bruteforceLimiter,
			instanceCreateLimiter, this._wrapInErrorHandler(
				this._doBind(this.parent.Routes.API.Instance, 'logout')));
		this.parent.app.post('/api/instance/extend_key', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this._doBind(this.parent.Routes.API.Instance, 'extendKey')));

		this.parent.app.post('/api/instance/2fa/enable', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this._doBind(this.parent.Routes.API.Instance.Twofactor, 'enable')));
		this.parent.app.post('/api/instance/2fa/disable', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this._doBind(this.parent.Routes.API.Instance.Twofactor, 'disable')));
		this.parent.app.post('/api/instance/2fa/confirm', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this._doBind(this.parent.Routes.API.Instance.Twofactor, 'confirm')));
		this.parent.app.post('/api/instance/2fa/verify', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this._doBind(this.parent.Routes.API.Instance.Twofactor, 'verify')));

		this.parent.app.post('/api/password/set', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this._doBind(this.parent.Routes.API.Password, 'set')));
		this.parent.app.post('/api/password/update', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this._doBind(this.parent.Routes.API.Password, 'update')));
		this.parent.app.post('/api/password/remove', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this._doBind(this.parent.Routes.API.Password, 'remove')));
		this.parent.app.post('/api/password/get', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this._doBind(this.parent.Routes.API.Password, 'get')));
		this.parent.app.post('/api/password/getmeta', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this._doBind(this.parent.Routes.API.Password, 'getmeta')));
		this.parent.app.post('/api/password/querymeta', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this._doBind(this.parent.Routes.API.Password, 'querymeta')));
		this.parent.app.post('/api/password/allmeta', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this._doBind(this.parent.Routes.API.Password, 'allmeta')));

		this.parent.app.post('/api/user/reset', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this._doBind(this.parent.Routes.API.Account, 'reset')));
		this.parent.app.post('/api/user/genresetkey', bruteforceLimiter,
			apiUseLimiter, this._wrapInErrorHandler(
				this._doBind(this.parent.Routes.API.Account, 'regenkey')));
	}
}