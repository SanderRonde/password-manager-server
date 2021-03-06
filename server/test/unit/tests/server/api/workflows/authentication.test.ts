const parallel = require('mocha.parallel') as (name: string, fn: (this: Mocha.Context) => any) => void;
import { genRSAKeyPair, hash, pad, decryptWithPrivateKey, ERRS, encryptWithPublicKey } from '../../../../../../app/lib/crypto';
import { genUserAndDb, createServer, captureURIs, doServerAPIRequest } from '../../../../lib/util';
import { DEFAULT_EMAIL } from '../../../../../../app/lib/constants';
import { genRandomString } from '../../../../../../app/lib/util';
import { doSingleQuery } from '../../../../lib/db';
import * as mongo from 'mongodb'
import { assert } from 'chai';

export function authenticationWorkflowTest() {
	parallel('Authentication', () => {
		const uris = captureURIs();
		it('can log in after registering instance', async () => {
			const config = await genUserAndDb();
			const server = await createServer(config);
			const { 
				http, 
				userpw, 
				uri, 
			} = config;
			uris.push(uri);

			const {
				instance_id, clientPrivateKey, serverPublicKey
			} = await (async  () => {
				const keyPair = genRSAKeyPair();
				const response = JSON.parse(await doServerAPIRequest({ port: http }, '/api/instance/register', {
					email: DEFAULT_EMAIL,
					password: hash(pad(userpw, 'masterpwverify')),
					public_key: keyPair.publicKey
				}));

				assert.isTrue(response.success, 'API call succeeded');
				if (!response.success) {
					return {};
				}
				const instance_id = decryptWithPrivateKey(response.data.id, keyPair.privateKey);
				const server_key = decryptWithPrivateKey(response.data.server_key, 
					keyPair.privateKey)
				
				assert.notStrictEqual(instance_id, ERRS.INVALID_DECRYPT, 'decryption was not successful');
				assert.notStrictEqual(server_key, ERRS.INVALID_DECRYPT, 'decryption was not successful');
				if (instance_id === ERRS.INVALID_DECRYPT || server_key === ERRS.INVALID_DECRYPT) {
					return {};
				}

				const instance = await doSingleQuery(uri, async (db) => {
					return await db.collection('instances').findOne({
						_id: new mongo.ObjectId(instance_id)
					});
				});
				assert.isTrue(!!instance, 'instance was created and ID is correct');

				assert.strictEqual(typeof server_key, 'string', 'type of serverkey is string');
				return {
					instance_id: instance_id,
					clientPrivateKey: keyPair.privateKey,
					serverPublicKey: server_key
				}
			})();
			await (async () => {
				const challenge = genRandomString(25);
				const response = JSON.parse(await doServerAPIRequest({ 
					port: http,
					publicKey: serverPublicKey!
				}, '/api/instance/login', {
					instance_id: instance_id!,
					challenge: encryptWithPublicKey(challenge, serverPublicKey!)
				}, {
					password_hash: hash(pad(userpw, 'masterpwverify'))
				}));

				server.kill();

				assert.isTrue(response.success, 'API call succeeded');
				if (!response.success) {
					return;
				}
				const data = response.data;
				assert.isFalse(data.u2f_required, 'no further authentication is required');
				if (data.u2f_required) return;
				const token = decryptWithPrivateKey(data.auth_token, clientPrivateKey!);
				const count = decryptWithPrivateKey(data.count, clientPrivateKey!);
				assert.notStrictEqual(token, ERRS.INVALID_DECRYPT, 'is not invalid decrypt');
				assert.notStrictEqual(count, ERRS.INVALID_DECRYPT, 'is not invalid decrypt');
				assert.strictEqual(typeof token, 'string', 'token is a string');
				assert.strictEqual(typeof count, 'number', 'type of count is number');

				assert.strictEqual(data.challenge, challenge, 'challenge matches');
			})();
		});
		it('can log out after logging in', async () => {
			const config = await genUserAndDb({
				account_twofactor_enabled: false
			});
			const server = await createServer(config);
			const { 
				http, 
				userpw, 
				uri, 
				server_public_key, 
				instance_id, 
				instance_private_key
			} = config;
			uris.push(uri);

			const token = await (async () => {	
				const challenge = genRandomString(25);
				const response = JSON.parse(await doServerAPIRequest({ 
					port: http,
					publicKey: server_public_key
				}, '/api/instance/login', {
					instance_id: instance_id.toHexString(),
					challenge: encryptWithPublicKey(challenge, server_public_key)
				}, {
					password_hash: hash(pad(userpw, 'masterpwverify'))
				}));
				
				assert.isTrue(response.success, 'API call succeeded');
				if (!response.success) {
					return;
				}
				const data = response.data;
				assert.isFalse(data.u2f_required, 'no further authentication is required');
				if (data.u2f_required) return;
				const token = decryptWithPrivateKey(data.auth_token, instance_private_key);
				assert.notStrictEqual(token, ERRS.INVALID_DECRYPT, 'is not invalid decrypt');
				if (token === ERRS.INVALID_DECRYPT) {
					return;
				}
				assert.strictEqual(typeof token, 'string', 'token is a string');
			
				assert.strictEqual(data.challenge, challenge, 'challenge matches');
				return token;
			})();
			await (async () => {	
				const response = JSON.parse(await doServerAPIRequest({ port: http }, '/api/instance/logout', {
					instance_id: instance_id.toHexString(),
					token: token!
				}));
			
				server.kill();
			
				assert.isTrue(response.success, 'API call succeeded')
			})();
		});
		it('can log in and extend key', async () => {
			const config = await genUserAndDb({
				account_twofactor_enabled: false
			});
			const server = await createServer(config);
			const { 
				http, 
				userpw, 
				uri, 
				server_public_key, 
				instance_id, 
				instance_private_key
			} = config;
			uris.push(uri);

			const { token, count } = await (async () => {	
				const challenge = genRandomString(25);
				const response = JSON.parse(await doServerAPIRequest({ 
					port: http,
					publicKey: server_public_key
				}, '/api/instance/login', {
					instance_id: instance_id.toHexString(),
					challenge: encryptWithPublicKey(challenge, server_public_key)
				}, {
					password_hash: hash(pad(userpw, 'masterpwverify'))
				}));
				
				assert.isTrue(response.success, 'API call succeeded');
				if (!response.success) {
					return {
						token: null,
						count: null
					};
				}
				const data = response.data;
				assert.isFalse(data.u2f_required, 'no further authentication is required');
				if (data.u2f_required) return {
					token: null,
					count: null
				};
				const token = decryptWithPrivateKey(data.auth_token, instance_private_key);
				const count = decryptWithPrivateKey(data.count, instance_private_key);
				assert.notStrictEqual(token, ERRS.INVALID_DECRYPT, 'is not invalid decrypt');
				if (token === ERRS.INVALID_DECRYPT) {
					return {
						token: null,
						count: null
					};
				}
				assert.notStrictEqual(count, ERRS.INVALID_DECRYPT, 'is not invalid decrypt');
				if (count === ERRS.INVALID_DECRYPT) {
					return {
						token: null,
						count: null
					};
				}
				assert.strictEqual(typeof token, 'string', 'token is a string');
				assert.strictEqual(typeof count, 'number', 'type of count is number');
			
				assert.strictEqual(data.challenge, challenge, 'challenge matches');
				return {
					token, count
				};
			})();
			await (async () => {	
				const response = JSON.parse(await doServerAPIRequest({ 
					port: http,
					publicKey: server_public_key
				}, '/api/instance/extend_key', {
					instance_id: instance_id.toHexString()
				}, {
					count: count!,
					old_token: token!
				}));
			
				server.kill();
			
				assert.isTrue(response.success, 'API call succeeded')
				if (!response.success) {
					return;
				}
				const data = response.data;
				assert.strictEqual(typeof data.auth_token, 'string', 'auth token was passed');
			})();
		});
		it('can register an instance, log in, extend key and log out', async () => {
			const config = await genUserAndDb();
			const server = await createServer(config);
			const { 
				http, 
				userpw, 
				uri, 
			} = config;
			uris.push(uri);

			const { instanceId, clientPrivateKey, serverPublicKey } = await (async  () => {
				const keyPair = genRSAKeyPair();
				const response = JSON.parse(await doServerAPIRequest({ port: http }, '/api/instance/register', {
					email: DEFAULT_EMAIL,
					password: hash(pad(userpw, 'masterpwverify')),
					public_key: keyPair.publicKey
				}));

				assert.isTrue(response.success, 'API call succeeded');
				if (!response.success) {
					return {};
				}
				const instance_id = decryptWithPrivateKey(response.data.id, keyPair.privateKey);
				const server_key = decryptWithPrivateKey(response.data.server_key, 
					keyPair.privateKey)
				
				assert.notStrictEqual(instance_id, ERRS.INVALID_DECRYPT, 'decryption was not successful');
				assert.notStrictEqual(server_key, ERRS.INVALID_DECRYPT, 'decryption was not successful');
				if (instance_id === ERRS.INVALID_DECRYPT || server_key === ERRS.INVALID_DECRYPT) {
					return {};
				}

				const instance = doSingleQuery(uri, async (db) => {
					return await db.collection('instances').findOne({
						_id: new mongo.ObjectId(instance_id)
					});
				});
				assert.isTrue(!!instance, 'instance was created and ID is correct');

				assert.strictEqual(typeof server_key, 'string', 'type of serverkey is string');
				return {
					instanceId: instance_id,
					clientPrivateKey: keyPair.privateKey,
					serverPublicKey: server_key
				}
			})();
			const { token, count } = await (async () => {
				const challenge = genRandomString(25);
				const response = JSON.parse(await doServerAPIRequest({ 
					port: http,
					publicKey: serverPublicKey!
				}, '/api/instance/login', {
					instance_id: instanceId!,
					challenge: encryptWithPublicKey(challenge, serverPublicKey!)
				}, {
					password_hash: hash(pad(userpw, 'masterpwverify'))
				}));

				assert.isTrue(response.success, 'API call succeeded');
				if (!response.success) {
					return {
						token: null,
						count: null
					};
				}
				const data = response.data;
				assert.isFalse(data.u2f_required, 'no further authentication is required');
				if (data.u2f_required) return {
					token: null,
					count: null
				};
				const token = decryptWithPrivateKey(data.auth_token, clientPrivateKey!);
				const count = decryptWithPrivateKey(data.count, clientPrivateKey!);
				assert.notStrictEqual(token, ERRS.INVALID_DECRYPT, 'is not invalid decrypt');
				if (token === ERRS.INVALID_DECRYPT) {
					return {
						token: null,
						count: null
					};
				}
				assert.notStrictEqual(count, ERRS.INVALID_DECRYPT, 'is not invalid decrypt');
				if (count === ERRS.INVALID_DECRYPT) {
					return {
						token: null,
						count: null
					};
				}
				assert.strictEqual(typeof token, 'string', 'token is a string');
				assert.strictEqual(typeof count, 'number', 'type of count is number');

				assert.strictEqual(data.challenge, challenge, 'challenge matches');
				return {
					token, count
				};
			})();
			const newToken = await (async () => {	
				const response = JSON.parse(await doServerAPIRequest({ 
					port: http,
					publicKey: serverPublicKey!
				}, '/api/instance/extend_key', {
					instance_id: instanceId!
				}, {
					count: count!,
					old_token: token!
				}));
			
				assert.isTrue(response.success, 'API call succeeded')
				if (!response.success) {
					return;
				}
				assert.strictEqual(typeof response.data.auth_token, 'string', 'auth token was passed');
				const decrypted = decryptWithPrivateKey(response.data.auth_token, clientPrivateKey!);
				assert.notStrictEqual(decrypted, ERRS.INVALID_DECRYPT, 'is not an invalid decrypt');
				if (decrypted === ERRS.INVALID_DECRYPT) {
					return;
				}
				return decrypted;
			})();
			await (async () => {	
				const response = JSON.parse(await doServerAPIRequest({ port: http }, '/api/instance/logout', {
					instance_id: instanceId!,
					token: newToken!
				}));
			
				server.kill();
			
				assert.isTrue(response.success, 'API call succeeded')
			})();
		});
	});
}