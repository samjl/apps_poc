const ldap = require('ldapjs');
const ObjectId = require('mongodb').ObjectId;

class ReserveClientConn {
  constructor(_db, socket, namespace) {
    this._db = _db;
    this.socket = socket;
    this.namespace = namespace;

    this.userLongName = '';  // LDAP long name
    this.userShortName = '';  // LDAP short name
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
        this.authenticate(data.userShortName, data.pass);
      }
    });
    this.socket.on('reserve', async (data) => {
      console.log("Reserve requested, data:");
      console.log(data);
      if (data.device === '') {
        // If testrig is unset then reserve all devices in the testrig.
        // Initial find in order to check if testrig is already reserved.
        let testrig = await this.findTestrig(data.testrig);
        this.reserveTestrig(testrig, data.userLongName);
      } else {
        // Reserve the specified device of the testrig.
        // Initial find in order to check if device is already reserved.
        let device = await this.findDevice(data.testrig, data.device);
        this.reserveDevice(device, data.device, data.userLongName, data.testrig)
      }
    });
    this.socket.on('release', async (data) => {
      console.log("Release requested, data:");
      console.log(data);
      this.release(data.testrig, data.device, data.userLongName);
    });
  }

  async findTestrig(testrig) {
    let match = {'_id': new ObjectId(testrig)};
    let err, response = await this._db.collection('testrigs').findOne(match);
    if (err) {
      console.log('Failed to find test rig ' + testrig + ' with error:');
      console.log(err);
    }
    return response;
  }

  async findDevice(testrigId, deviceName) {
    let match = {
      '_id': new ObjectId(testrigId),
      'devices': {'$elemMatch': {'name': deviceName}}
    };
    let projection = {
      'name': 1,
      'devices.$': 1
    };
    let err, response = await this._db.collection('testrigs').findOne(match, {'projection': projection});
    if (err) {
      console.log('Failed to find test rig ' + testrigId + ' with error:');
      console.log(err);
    }
    return response;
  }

  release(testrigId, deviceName, clientLongName) {
    let match = {'_id': new ObjectId(testrigId)};
    let end = new Date(Date.now()).toISOString();
    let update = {'$set': {"devices.$[elem].reservations.0.end": end}};
    let options = {
      'arrayFilters': [{'elem.reservations.0.end': {$exists: false}}],
      'returnOriginal': false
    };
    if (clientLongName === this.adminUser) {
      let ip = this.socket.handshake.address;
      console.log('ADMIN RELEASING DEVICE ' + deviceName + ' TESTRIG ' +
        testrigId + ' (from IP ' + ip + ')');
    } else {
      // Add username to array filters - only release users own reservations.
      options.arrayFilters[0]['elem.reservations.0.userLongName'] = clientLongName;
    }
    if (deviceName !== '') {
      console.log('Releasing device ' + deviceName + ', a member of testrig '
        + testrigId);
      options.arrayFilters[0]['elem.name'] = deviceName;
      options.multi = false;
    } else {
      console.log('Releasing all devices for testrig ' + testrigId);
      options.multi = true;
    }
    this._db.collection('testrigs').findOneAndUpdate(match, update, options, (err, result) => {
      console.log(err);
      console.log(result);
      console.log(result.value.devices[0]);

      if(err == null) {  //  TODO other checks - && result.matchedCount ===
        // 1 && result.modifiedCount === 1
        console.log('Successfully updated the reservation (' +
          result.modifiedCount + ' modifications)');
        // Emit all testrig devices that have been released
        let releasedDevices = Array();
        let userNoReservations = true;
        for (let i=0; i<result.value.devices.length; i++) {
          if (result.value.devices[i].reservations[0].hasOwnProperty('end')) {
            releasedDevices.push({
              'name': result.value.devices[i].name,
              'endTime': result.value.devices[i].reservations[0].end
            })
          } else {
            if (result.value.devices[i].reservations[0].userLongName === clientLongName) {
              // Flag that the user still has devices reserved.
              userNoReservations = false;
            }
          }
        }
        console.log(releasedDevices);
        // Determine is all the devices in the testrig are now free.
        let allDevicesAvailable = releasedDevices.length === result.value.devices.length;
        this.namespace.emit('released', {
          testrig: testrigId,
          allAvailable: allDevicesAvailable,
          userNoReservations: userNoReservations,
          devices: releasedDevices
        });
      } else {
        console.log('User ' + clientLongName + ' failed to release test rig ' +
          testrigId + ' with error:');
        console.log(err);
      }
      // TODO tell the client that it was unsuccessful
    });
  }

  reserveDevice(deviceDoc, deviceName, clientLongName, testrigName) {
    console.log('Ensure the device is free');
    if (!deviceDoc.devices[0].reservations[0].hasOwnProperty('end') &&
        deviceDoc.devices[0].reservations[0].hasOwnProperty('userLongName')) {
      console.log(deviceDoc.devices[0].name + " is already reserved");
      return;
    }
    let ip = this.socket.handshake.address;
    console.log('Reserve device ' + deviceName + ' (from testrig ' +
      deviceDoc.name + ') for user ' + clientLongName + ' with IP ' + ip);
    let bulk = this._db.collection('testrigs').initializeOrderedBulkOp();
    let startTime = new Date(Date.now()).toISOString();
    let match = {
      'name': deviceDoc.name,
      'devices': {'$elemMatch': {'name': deviceName}}
    };
    bulk.find(match).updateOne(
      {'$push':
        {'devices.$.reservations':
          {'$each': [{
            'userLongName': clientLongName,
            'userShortName': this.userShortName,
            'ip': ip,
            'start': startTime}],
          '$position': 0}
        }
      }
    );
    // Reservations array must be full length for this to work.
    bulk.find(match).updateOne(
      {'$pop': {'devices.$.reservations': 1}}
    );
    bulk.execute(async (err, result) => {
      console.log(err);
      console.log(result);
      if(err == null && result.nModified === 2 && result.nMatched === 2) {
        console.log('Successfully updated the device reservation');
        // Get the updated testrig document to check of all devices are
        // reserved.
        let testrig = await this.findTestrig(testrigName);
        console.log(testrig);
        let allReserved = true;
        for(let i=0; i<testrig.devices.length; i++) {
          console.log(testrig.devices[i].reservations[0]);
          if (testrig.devices[i].reservations[0].hasOwnProperty('end')) {
            allReserved = false;
            break;
          }
        }
        console.log('All devices reserved: ' + allReserved);
        this.namespace.emit('device reserved', {
          testrig: deviceDoc._id,
          allReserved: allReserved,
          device: deviceName,
          userLongName: clientLongName,
          ip: ip,
          start: startTime,
          prevRes: deviceDoc.devices[0].reservations[0]
        });
      } else {
        console.log('User ' + clientLongName + ' failed to reserve device ' +
          deviceName + ' with error:');
        console.log(err);
        // TODO emit
      }
    });
  }


  reserveTestrig(testrigDoc, clientLongName) {
    // Reserve as many devices in a testrig as possible.
    // Get all devices in the testrig that are free.
    let devices = Array();
    let deviceIndices = Array();
    for (let i=0; i<testrigDoc.devices.length; i++) {
      if (!testrigDoc.devices[i].reservations[0].hasOwnProperty('end') &&
          testrigDoc.devices[i].reservations[0].hasOwnProperty('userLongName') &&
          testrigDoc.devices[i].reservations[0].userLongName !== clientLongName) {
        console.log('Testrig ' + testrigDoc.devices[i].name +
          ' is already reserved');
        // return;
      } else {
        devices.push({
          'name': testrigDoc.devices[i].name,
          'prevRes': testrigDoc.devices[i].reservations[0]
        });
        deviceIndices.push(i);
      }
    }
    let ip = this.socket.handshake.address;
    console.log('Reserve all the devices in the testrig for user ' + clientLongName +
                ' with IP ' + ip);
    // TODO this can be updated to use a single update using arrayFilters
    //  when they are implemented for bulk operations
    let bulk = this._db.collection('testrigs').initializeOrderedBulkOp();
    let startTime = new Date(Date.now()).toISOString();
    let match = {'_id': testrigDoc._id};
    for (let j=0; j<deviceIndices.length; j++) {
      let reservePath = 'devices.' + deviceIndices[j] + '.reservations';
      let update = {'$push': {}};
      update['$push'][reservePath] = {
        '$each': [{
          'userLongName': clientLongName,
          'userShortName': this.userShortName,
          'ip': ip,
          'start': startTime
        }],
        '$position': 0
      };
      let remove = {'$pop': {}};
      remove['$pop'][reservePath] = 1;
      // Update the current reservation.
      bulk.find(match).updateOne(update);
      // Remove the oldest reservation. Note: reservations array must be full
      // length for this to work.
      bulk.find(match).updateOne(remove);
    }
    bulk.execute((err, result) => {
      // FIXME if(err == null && result.nModified === 2 && result.nMatched ===
      // 2) {
      if(err == null && result.nModified > 0) {
        console.log('Successfully updated the testrig reservation');
        this.namespace.emit('testrig reserved', {
          testrig: testrigDoc._id,
          devices: devices,
          userLongName: clientLongName,
          ip: ip,
          start: startTime,
        });
      } else {
        console.log('User ' + clientLongName + ' failed to reserve test rig ' +
          testrigDoc.name + ' with error:');
        console.log(err);
        // TODO emit
      }
    });
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

  async authenticate(clientShortName, password) {
    let ldapAdmin = new LdapClient('NZ Jenkins');
    // TODO encrypt the admin credentials
    let bindSuccess = await ldapAdmin.bind('NZJ1209$$');
    if (bindSuccess) {
      let user = await ldapAdmin.findUser(clientShortName);
      console.log('Found user:');
      console.log(user);
      if (user.length === 1) {
        let longName = user[0].name;  // FIXME save this at this end and
        // don't use the username from client to reserve/release - or use both?
        // TODO on client signOut clear this name
        let ldapUser = new LdapClient(longName);
        let userBindSuccess = await ldapUser.bind(password);
        if (userBindSuccess) {
          console.log('User authenticated successfully');
          this.userLongName = longName;
          this.userShortName = clientShortName;
          this.socket.emit('login auth', {
            success: true,
            userShortName: clientShortName,
            userLongName: longName
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
