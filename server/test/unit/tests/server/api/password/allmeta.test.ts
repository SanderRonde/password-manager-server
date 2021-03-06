const parallel = require('mocha.parallel') as (name: string, fn: (this: Mocha.Context) => any) => void;
import { captureURIs, genUserAndDb, createServer, getLoginToken, setPasword, doServerAPIRequest, genURL, doesNotThrow } from '../../../../lib/util';
import { StringifiedObjectId, EncryptedInstance } from '../../../../../../app/../../shared/types/db-types';
import { decryptWithPrivateKey, ERRS, hash, pad } from '../../../../../../app/lib/crypto';
import { testParams, testInvalidCredentials } from '../../../../lib/macros';
import { genRandomString } from '../../../../../../app/lib/util';
import { API_ERRS } from '../../../../../../app/../../shared/types/api';
import * as speakeasy from 'speakeasy'
import * as mongo from 'mongodb'
import { assert } from 'chai';
import * as url from 'url'

export function passwordAllmetaTest() {
	parallel('Allmeta', () => {
		const uris = captureURIs();
		testParams(it, uris, '/api/password/allmeta', {
			instance_id: 'string'
		}, {}, {
			count: 'number',
			token: 'string',
			password_hash: 'string',
		}, { });
		it('can get the password\'s metadata', async () => {
			const config = await genUserAndDb({
				account_twofactor_enabled: true
			});
			const server = await createServer(config);
			const { http, uri, server_public_key, instance_private_key, userpw } = config;
			uris.push(uri);

			let { count, token } = (await getLoginToken(config))!;

			const expectedPasswords = [{
				websites: [genURL(), genURL()],
				username: genRandomString(20),
				password: genRandomString(20),
				notes: [genRandomString(10), genRandomString(10), genRandomString(10)],
				twofactorEnabled: false
			}, {
				websites: [genURL(), genURL()],
				username: genRandomString(20),
				password: genRandomString(20),
				notes: [genRandomString(10), genRandomString(10), genRandomString(10)],
				twofactorEnabled: true
			}];
			const passwordIds = [
				await setPasword({
					websites: expectedPasswords[0].websites,
					twofactor_enabled: expectedPasswords[0].twofactorEnabled,
					username: expectedPasswords[0].username,
					password: expectedPasswords[0].password,
					notes: expectedPasswords[0].notes
				}, token, count++, config), 
				await setPasword({
					websites: expectedPasswords[1].websites,
					twofactor_enabled: expectedPasswords[1].twofactorEnabled,
					username: expectedPasswords[1].username,
					password: expectedPasswords[1].password,
					notes: expectedPasswords[1].notes
				}, token, count++, config)
			];

			const response = JSON.parse(await doServerAPIRequest({ 
				port: http,
				publicKey: server_public_key
			}, '/api/password/allmeta', {
				instance_id: config.instance_id.toHexString()
			}, {
				count: count++,
				token: token!,
				password_hash: hash(pad(userpw, 'masterpwverify'))
			}));

			server.kill();

			assert.isTrue(response.success, 'API call succeeded');
			if (!response.success) {
				return;
			}
			const data = response.data;
			const decryptedData = decryptWithPrivateKey(data.encrypted, instance_private_key);
			assert.notStrictEqual(decryptedData, ERRS.INVALID_DECRYPT, 'is not an invalid decrypt');
			if (decryptedData === ERRS.INVALID_DECRYPT) return;

			const parsed = doesNotThrow(() => {
				return JSON.parse(decryptedData);
			}, 'data can be parsed');
			assert.strictEqual(parsed.length, expectedPasswords.length, 'exactly 2 passwords are returned');
			for (let i = 0; i < expectedPasswords.length; i++) {
				const parsedValue = parsed[i];
				const expected = expectedPasswords[i];
				assert.strictEqual(parsedValue.id, passwordIds[i], 'password IDs are the same');
				for (let i = 0; i < expected.websites.length; i++) {
					const expectedWebsite = expected.websites[i];
					const actualWebsite = parsedValue.websites[i];
			
					assert.isTrue(!!actualWebsite, 'note exists');
					const hostname = url.parse(expectedWebsite).hostname || 
						url.parse(expectedWebsite).host || expectedWebsite
					assert.strictEqual(actualWebsite.host, hostname, 'host names match');
					assert.strictEqual(actualWebsite.exact, expectedWebsite, 'exact urls match');
				}
				assert.strictEqual(parsedValue.twofactor_enabled, expected.twofactorEnabled, 'twofactor enabled is the same');
			}
		});
		it('fails if auth token is wrong', async () => {
			const secret = speakeasy.generateSecret({
				name: 'Password manager server',
				length: 64
			});
			const config = await genUserAndDb({
				account_twofactor_enabled: true,
				twofactor_secret: secret.ascii
			});
			const server = await createServer(config);
			const { http, uri, server_public_key, userpw } = config;
			uris.push(uri);

			await testInvalidCredentials({
				route: '/api/password/allmeta',
				port: http,
				unencrypted: {
					instance_id: config.instance_id.toHexString()
				},
				encrypted: {
					count: 0,
					token: 'wrongtoken',
					password_hash: hash(pad(userpw, 'masterpwverify'))
				},
				server: server,
				publicKey: server_public_key
			});
		});
		it('fails if instance id is wrong', async () => {
			const secret = speakeasy.generateSecret({
				name: 'Password manager server',
				length: 64
			});
			const config = await genUserAndDb({
				account_twofactor_enabled: true,
				twofactor_secret: secret.ascii
			});
			const server = await createServer(config);
			const { http, uri, server_public_key, userpw } = config;
			uris.push(uri);

			const { token, count } = (await getLoginToken(config))!;
			await testInvalidCredentials({
				route: '/api/password/allmeta',
				port: http,
				unencrypted: {
					instance_id: new mongo.ObjectId().toHexString() as StringifiedObjectId<EncryptedInstance>
				},
				encrypted: {
					count: count,
					token: token!,
					password_hash: hash(pad(userpw, 'masterpwverify'))
				},
				server: server,
				publicKey: server_public_key,
				err: API_ERRS.INVALID_CREDENTIALS
			});
		});
		it('fails if password is wrong', async () => {
			const secret = speakeasy.generateSecret({
				name: 'Password manager server',
				length: 64
			});
			const config = await genUserAndDb({
				account_twofactor_enabled: true,
				twofactor_secret: secret.ascii
			});
			const server = await createServer(config);
			const { http, uri, server_public_key } = config;
			uris.push(uri);

			const { token, count } = (await getLoginToken(config))!;
			await testInvalidCredentials({
				route: '/api/password/allmeta',
				port: http,
				unencrypted: {
					instance_id: config.instance_id.toHexString()
				},
				encrypted: {
					count: count,
					token: token,
					password_hash: hash(pad('wrongpassword', 'masterpwverify'))
				},
				server: server,
				publicKey: server_public_key
			});
		});
	});
}