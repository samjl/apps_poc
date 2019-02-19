const ldap = require('ldapjs');

class ReserveClientConn {
  constructor(_db, socket, namespace) {
    this._db = _db;
    this.socket = socket;
    this.namespace = namespace;

    this.adminUser = 'Jenkins Test';

    this.socket.on('init', () => {
      this.allTestRigs();
    });
    this.socket.on('login', (data) => {
      // Check for an empty password, workaround for
      // https://github.com/joyent/node-ldapjs/issues/191
      if (!data.pass) {
        console.log('No password supplied');
        this.socket.emit('login auth', {
          success: false,
          msg: 'No password supplied'
        });
      } else {
        this.authenticate(data.user, data.pass);
      }
    });
    this.socket.on('reserve', async (data) => {
      let testrig = await this.findTestrig(data.testrig);
      if (testrig !== null) {
        this.reserve(testrig, data.user);
      }
    });
    this.socket.on('release', async (data) => {
      let testrig = await this.findTestrig(data.testrig);
      if (testrig !== null) {
        this.release(testrig, data.user);
      }
    });

  }

  async findTestrig(testrig) {
    let match = {'name': testrig};
    let err, response = await this._db.collection('testrigs').findOne(match);
    if (err) {
      console.log('Failed to find test rig ' + testrig + ' with error:');
      console.log(err);
    }
    return response;
  }

  release(testrigDoc, username) {
    let ip = this.socket.handshake.address;
    let reserved_user = testrigDoc.reservations[0].user;
    if (reserved_user === username || this.adminUser === username) {
      console.log('Releasing ' + testrigDoc.name + ' for user ' + username
        + ' @ IP ' + ip);
      let end = new Date(Date.now()).toISOString();
      let prevUser = testrigDoc.reservations[0];
      prevUser.end = end;
      let match = {'name': testrigDoc.name};
      let update = {'$set': {'reservations.0.end': end}};
      this._db.collection('testrigs').updateOne(match, update, (err, result) => {
        if(err == null && result.modifiedCount === 1 && result.matchedCount === 1) {
          console.log('Successfully updated the reservation');
          this.namespace.emit('released', {
            testrig: testrigDoc.name,
            prevUser: testrigDoc.reservations[0]
          });
        } else {
          console.log('User ' + username + ' failed to release test rig ' +
            testrigDoc.name + ' with error:');
          console.log(err);
        }
        // TODO tell the client that it was unsuccessful
      });
    }
  }

  // TODO enhancement: When someone tries to reserve/request a rig that is
  // reserved send a message to the requester.
  reserve(testrigDoc, username) {
    if (testrigDoc.reservations[0].hasOwnProperty('end')) {
      // Test rig is not currently reserved
      let ip = this.socket.handshake.address;
      console.log('Reserving ' + testrigDoc.name + ' for IP ' + ip +
        ' and user ' + username);
      let bulk = this._db.collection('testrigs').initializeOrderedBulkOp();
      let startTime = new Date(Date.now()).toISOString();
      let match = {'name': testrigDoc.name};
      bulk.find(match).updateOne({
        '$push': {
          'reservations': {
            '$each': [{
              'user': username,
              'ip': ip,
              'start': startTime
            }],
            '$position': 0
          }
        }
      });
      bulk.find(match).updateOne({
        '$pop': {
          'reservations': 1
        }
      });
      bulk.execute((err, result) => {
        if(err == null && result.nModified === 2 && result.nMatched === 2) {
          console.log('Successfully updated the reservation');
          this.namespace.emit('reserved', {
            testrig: testrigDoc.name,
            user: username,
            ip: ip,
            start: startTime,
            prevUser: testrigDoc.reservations[0]
          });
        } else {
          console.log('User ' + username + ' failed to reserve test rig ' +
            testrigDoc.name + ' with error:');
          console.log(err);
          // TODO emit
        }
      });
    } else {
      // Don't need to emit this to the client. If someone else reserves a
      // test rig before this reservation completes then the test rig status
      // is updated to indicate this.
      console.log('Test rig is already reserved');
    }
  }

  allTestRigs() {
    const testRigsPromise = this._db.collection('testrigs').find().toArray();
    testRigsPromise
      .then((docs) => {
        console.log('find returned ' + docs.length + ' testrig docs');
        let data = {};
        data.client_ip = this.socket.handshake.address;
        data.testrigs = docs;
        this.socket.emit('all_rigs', data);
      })
      .catch(function whenErr(err) {
        console.log('Error');
        console.log(err);
      });
  }

  async authenticate(username, password) {
    let ldapAdmin = new LdapClient('NZ Jenkins');
    // TODO encrypt the admin credentials
    let bindSuccess = await ldapAdmin.bind('NZJ1209$$');
    if (bindSuccess) {
      let user = await ldapAdmin.findUser(username);
      console.log('Found user:');
      console.log(user);
      if (user.length === 1) {
        let longname = user[0].name;
        let ldapUser = new LdapClient(longname);
        let userBindSuccess = await ldapUser.bind(password);
        if (userBindSuccess) {
          console.log('User authenticated successfully');
          this.socket.emit('login auth', {
            success: true,
            user: username,
            longName: longname
          });
          ldapUser.unbind();
        } else {
          this.loginFail('Authentication failed');
        }
      } else {
        this.loginFail('Username not found');
        console.error(user);
      }
      ldapAdmin.unbind();
    } else {
      console.error('LDAP admin user bind failed');
      this.loginFail('Server error (LDAP)');
    }
  }

  loginFail(errorMessage) {
    console.log(errorMessage);
    this.socket.emit('login auth', {
      success: false,
      msg: errorMessage
    });
  }
}

class LdapClient {
  constructor(longName) {
    this.ldapURLPart1 = 'ldap://dcgnetnz2.GNET.global.vpn/CN=';
    this.ldapURLPart2 =
      ',OU=Application,OU=Special Accounts,OU=APAC,DC=GNET,DC=global,DC=vpn';
    // longName must be the LDAP long name
    this.longName = longName;
    this.client = ldap.createClient({
      url: this.ldapURLPart1 + longName + this.ldapURLPart2
    });
  }

  async bind(password) {
    try {
      let bindResult = await getBind(this.client, this.longName, password);
      return bindResult;

    } catch(err) {
      return false;
    }
  }

  async findUser(shortName) {
    let user = await getUser(this.client, shortName);
    return user;
  }

  unbind() {
    this.client.unbind((err) => {
      if (err) {
        console.log('Failed to unbind LDAP client for user ' + this.longName +
          ' with error: ' + err);
      } else {
        console.log('LDAP client for user ' + this.longName + ' unbind successful');
      }
    });
  }
}

const getBind = (client, username, password) => new Promise((resolve, reject) => {
  client.bind(username, password, (err, response) => {
    if (err) {
      console.log("LDAP client bind failed");
      console.log(err);
      reject(false);
    } else {
      console.log("LDAP client bind successful");
      resolve(true);
    }
  });
});

const getUser = (client, username) => new Promise((resolve, reject) => {
  let opts = {
    // Filter by short user name (e.g. nzjenkins)
    filter: '(sAMAccountName=' + username + ')',
    scope: 'sub',
    attributes: ['sAMAccountName', 'name']
  };
  client.search('DC=GNET,DC=global,DC=vpn', opts, async (err, search) => {
    if (err) {
      console.log("Search failed");
      console.log(err);
      reject();
    } else {
      console.log("Search initiated successfully");
      // console.log(search);
      let entries = [];
      search.on('searchEntry', function(entry) {
        entries.push(entry.object);
      });
      search.on('error', function(err) {
        console.error('Error finding LDAP user ' + username + ':');
        console.error(err.message);
        reject();
      });
      await getSearchEnd(search);
      resolve(entries);
    }
  });
});

const getSearchEnd = (search) => new Promise((resolve, reject) => {
  search.on('end', (result) => {
    resolve();
  });
  search.on('error', (err) => {
    console.error('Error detecting end of LDAP user search:');
    console.error(err.message);
    reject();
  });
});

module.exports.ReserveClientConn = ReserveClientConn;
