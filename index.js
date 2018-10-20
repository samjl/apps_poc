'use strict';
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const ldap = require('ldapjs');
const port = process.env.PORT || 3000;

// MongoDB constants and globals
const MongoClient = require('mongodb').MongoClient;
const db_name = 'proto2';  // 'dev'; 'proto2'
let _db;

// LDAP constants
const adminUsername = 'NZ Jenkins';
const adminPassword = 'NZJ1209$$';

// TODO Deal with LDAP errors. Restart node server? How do we cleanup?
function ldapClientUnbind(client, username) {
  client.unbind(function(err) {
    if (err) {
      console.log('Failed to unbind LDAP client for user ' + username +
        ' with error: ' + err);
    } else {
      console.log('LDAP client unbind for user ' + username + ' successful');
    }
  });
}

function loginAuthFailure(socket, errorMsg) {
  socket.emit('login auth', {
    success: false,
    msg: errorMsg
  });
}

function authenticateClient(username, password, socket) {
  let ldapURLPart1 = 'ldap://GNET.global.vpn/CN=';
  let ldapURLPart2 =
    ',OU=Application,OU=Special Accounts,OU=APAC,DC=GNET,DC=global,DC=vpn';
  let client = ldap.createClient({
    url: ldapURLPart1 + adminUsername + ldapURLPart2
  });

  let opts = {
    // Filter by short user name (e.g. nzjenkins)
    filter: '(sAMAccountName=' + username + ')',
    scope: 'sub',
    attributes: ['sAMAccountName', 'name']
  };
  client.bind(adminUsername, adminPassword, function(err) {
    if (err) {
      logSocket(socket, 'Admin LDAP client bind failed with error:');
      console.log(err);
    } else {
      logSocket(socket, 'Admin LDAP client bind successful');
      client.search('DC=GNET,DC=global,DC=vpn', opts, function(err, search) {
        if (err) {
          logSocket(socket, 'Search error:');
          console.log(err);
          ldapClientUnbind(client, adminUsername);
        }
        logSocket(socket, 'Search successful');
        let entries = [];
        search.on('searchEntry', function(entry) {
          entries.push(entry.object);
        });
        search.on('error', function(err) {
          console.error('error: ' + err.message);
        });
        search.on('end', function(result) {
          // TODO check result.status === 0?
          if (entries.length === 1) {
            // let entry = entries[0];
            let longname = entries[0].name;
            let userClient = ldap.createClient({
              url: ldapURLPart1 + username + ldapURLPart2
            });
            // Do the authentication
            logSocket(socket, 'Authenticating user ' + longname);
            userClient.bind(longname, password, function(err) {
              if (err) {
                logSocket(socket, 'User ' + username + ' (' + longname +
                  ') LDAP client bind' + ' failed with' + ' error:');
                console.log(err);
                loginAuthFailure(socket, 'Authentication failed');
                ldapClientUnbind(userClient, longname);
              } else {
                logSocket(socket, 'User ' + username + '(' + longname +
                  ') LDAP client bind successful');
                socket.emit('login auth', {
                  success: true,
                  user: username,
                  longName: longname
                });
                ldapClientUnbind(userClient, longname);
              }
            });
          } else if (entries.length === 0) {
            logSocket(socket, 'User name ' + username + ' not found');
            loginAuthFailure(socket, 'Username not found');
          } else {
            // More than 1 user match the username - shouldn't ever see this
            logSocket(socket, 'Multiple user names found');
            loginAuthFailure(socket, 'Multiple matching users found!');
          }
          ldapClientUnbind(client, adminUsername);
        });
      });
    }
  });
}

// Root - latest session - TODO add main menu screen instead of this
app.get('/', function(req, res){
  res.sendFile(__dirname + '/public/session.html');
});

// Test log viewer.
app.get('/test', function(req, res){
  res.sendFile(__dirname + '/public/testlog.html');
});

// Main session page/dashboard. Displays test results for (mongoDB) test
// sessions. Waits for a session to start, as required, and updates live
// results as session progresses.
app.get('/session', function(req, res){
  res.sendFile(__dirname + '/public/session.html')
});

app.get('/reserve', function(req, res){
  res.sendFile(__dirname + '/public/reserve.html')
});

// Client access to all static content (public dir)
app.use(express.static(__dirname + '/public'));

let res = io.of('/reservations');
res.on('connection', function(socket) {
  logSocket(socket, 'New connection to reservations namespace');
  allTestRigs(socket);

  socket.on('reserve', function(data) {
    let socket = this;
    console.log(data);
    // Ensure rig is not reserved and reserve the rig for the requested user.
    testRigReserve(socket, data.testrig, data.user);
  });

  socket.on('release', function(data) {
    let socket = this;
    console.log(data);
    // Ensure the rig is reserved by the user, release rig and move last user
    // to history.
    testRigRelease(socket, data.testrig, data.user);
  });

  socket.on('login', function(data) {
    let socket = this;
    console.log(data);
    // Check for an empty password, workaround for
    // https://github.com/joyent/node-ldapjs/issues/191
    if (!data.pass) {
      logSocket(socket, 'No password supplied');
      socket.emit('login auth', {
        success: false,
        msg: 'No password supplied'
      });
    } else {
      authenticateClient(data.user, data.pass, socket);
    }
  });

  // TODO enhancement: When someone tries to reserve/request a rig that is
  // reserved send a message to the
});

io.on('connection', function(socket){
  let handshake = socket.handshake;
  logSocket(socket, 'New connection');

  // Development PoC options
  // 1. Tail the oplog: get all oplogs for the collection (already existing in oplog and then tail it)
  // tailOplog(socket)
  // 2. Retrieve completed test logs from the proto db testlogs collection and emit all in one go
  // retrieveTestLog(socket)
  // 3. Retrieve completed test logs from the proto db testlogs collection then emit in sections
  // retrieveTestLogParts(socket)
  // 4. Retrieve completed test logs from the proto db testlogs collection, convert to HTML DOM elements and emit
  // retrieveTestHtml(socket)

  // On connect client informs server which page is loaded
  socket.on('from', function(data) {
    let socket = this;
    logSocket(socket, 'Client page is ' + data.page);
    switch (data.page) {
      case 'test':
        logSocket(socket, 'Test log page - session = ' + data.params.session +
          ', module = ' + data.params.module);
        retrieveTestLogParts(socket, data.params.session, data.params.module);
        break;
      case 'session':
        logSocket(socket, 'Session page');
        console.log(data.params);
        if (!Object.keys(data.params).length) {
          console.log('No params received from client, get/track the most' +
            ' recent session.');
          _db.collection('sessioncounter').findOne({}, (err, item) => {
            if (item != null) {
              let params = {};
              params.sessionIds = [item.sessionId];
              sessionDashBySWVersion(socket, params);
            } else if (err != null) {
              logSocket(socket, 'Failed to get session counter with MongoDB' +
                ' err: ' + err);
            } else {
              logSocket(socket, 'Failed to get session counter: no items' +
                ' returned');
            }
          });
        } else {
          sessionDashBySWVersion(socket, data.params);
        }
        break;
      default:
        logSocket(socket, 'Unknown page');
    }
  });
});

function testRigRelease(socket, testrig, user) {
   // ensure the testrig is reserved by the current user
  let match = {'name': testrig};
  _db.collection('testrigs').findOne(match, (err, item) => {
    if (item != null) {
      let ip = socket.handshake.address;
      let reserved_ip = item.reservations[0].ip;
      if (reserved_ip === ip) {
        console.log('Releasing ' + testrig + ' for IP ' + ip + ' and user ' +
          user);
        let end = new Date(Date.now()).toISOString();
        let prevUser = item.reservations[0];
        prevUser.end = end;
        _db.collection('testrigs').updateOne(match, {
          '$set': {
            'reservations.0.end': end,
          }
        }, (err, result) => {
          if(err == null && result.modifiedCount === 1 && result.matchedCount === 1) {
            console.log('Successfully updated the reservation');
            res.emit('released', {
              testrig: testrig,
              prevUser: item.reservations[0]
            });
          }
          // TODO tell the client that it was unsuccessful
        });
      }
    } else if (err != null) {
      logSocket(socket, 'Failed to testrig document with MongoDB err: ' + err);
    } else {
      logSocket(socket, 'Failed to testrig document: no items returned');
    }
    // TODO tell the client that it was unsuccessful
  });
}

function testRigReserve(socket, testrig, user) {
  // Check if the testrig is available
  let match = {'name': testrig};
  _db.collection('testrigs').findOne({
    'name': testrig,
    // 'reservations.0.end': {'$exists': true}  //null
  }, (err, item) => {
    if (item != null) {
      // Check the end field here rather than in the find
      // 'reservations.0.end': {'$exists': true} - (returns no docs)
      // so that we can use the returned document.
      if (item.reservations[0].hasOwnProperty('end')) {
        let ip = socket.handshake.address;
        console.log('Reserving ' + testrig + ' for IP ' + ip + ' and user ' +
          user);
        let bulk = _db.collection('testrigs').initializeOrderedBulkOp();
        let start = new Date(Date.now()).toISOString();
        bulk.find(match).updateOne({
          '$push': {
            'reservations': {
              '$each': [{
                'user': user,
                'ip': ip,
                'start': start
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
            res.emit('reserved', {
              testrig: testrig,
              user: user,
              ip: ip,
              start: start,
              prevUser: item.reservations[0]
            });
          }
        });
      }
    } else if (err != null) {
      logSocket(socket, 'Failed to get testrig document with MongoDB err: ' +
        err);
    } else {
      logSocket(socket, 'Test rig is already reserved');
    }
    // TODO tell the client that it was unsuccessful
  });
}

function allTestRigs(socket) {
  _db.collection('testrigs').find({}).toArray(function(err, docs) {
    // TODO pipeline project just name and reservations
    if (err == null) {
      logSocket(socket, 'find returned ' + docs.length + ' testrig docs');
      let data = {};
      data.client_ip = socket.handshake.address;
      data.testrigs = docs;
      socket.emit('all_rigs', data);
    }
  });
}

function logSocket(socket, msg) {
  console.log('[' + socket.handshake.address + '] ' + msg);
}

function sessionDashBySWVersion(socket, params) {
  // Create the change stream pipeline and the find match using the parameters
  // passed from the client
  // branchName, branchNumber, buildNumber, sessionIds, excludedIds?
  let pipelineMatch = {};
  let findMatch = {};
  if (params.hasOwnProperty('branchName')) {
    pipelineMatch['fullDocument.embeddedVersion.branchName'] = params.branchName;
    findMatch['embeddedVersion.branchName'] = params.branchName;
  }
  if (params.hasOwnProperty('branchNumber')) {
    pipelineMatch['fullDocument.embeddedVersion.branchNumber'] = params.branchNumber;
    findMatch['embeddedVersion.branchNumber'] = params.branchNumber;
  }
  if (params.hasOwnProperty('buildNumber')) {
    pipelineMatch['fullDocument.embeddedVersion.buildNumber'] = params.buildNumber;
    findMatch['embeddedVersion.buildNumber'] = params.buildNumber;
  }
  // excludeIds and sessionIds are currently mutually exclusive
  if (params.hasOwnProperty('sessionIds')) {
    pipelineMatch['fullDocument.sessionId'] = {'$in': params.sessionIds};
    findMatch['sessionId'] = {'$in': params.sessionIds};
  }
  if (params.hasOwnProperty('excludeIds')) {
    pipelineMatch['fullDocument.sessionId'] = {'$nin': params.excludeIds};
    findMatch['sessionId'] = {'$nin': params.excludeIds};
  }

  let pipeline = [
    {
      $match: pipelineMatch
    },
    {
      $project: {
        operationType: 1,
        updateDescription: 1,
        fullDocument: 1
      }
    }
  ];
  sessionsChangeStream(pipeline, socket);
  // Find existing
  sessionsFindExisting(findMatch, socket);
}

function sessionsChangeStream(pipeline, socket) {
  let changeStream = _db.collection('sessions').watch(pipeline,
    {fullDocument: 'updateLookup'});
  changeStream.on("change", function(change) {
    if (change.operationType === 'insert') {
      logSocket(socket, 'session ' + change.fullDocument.sessionId +
        ' insert (change stream)');
      socket.emit('session_insert', change.fullDocument);
    } else if (change.operationType === 'update'){
      logSocket(socket, 'session ' + change.fullDocument.sessionId +
        ' update (change stream)');
      // Add the session ID to then transmitted update.
      change.updateDescription.sessionId = change.fullDocument.sessionId;
      socket.emit('session_update', change.updateDescription);
    } else {
      logSocket(socket, 'Unhandled change operation (' + change.operationType +
        ')');
    }
  });
}

function sessionsFindExisting(match, socket) {
  logSocket(socket, 'finding:');
  _db.collection('sessions').find(match).toArray(function(err, docs) {
    if (err) throw err;
    logSocket(socket, 'find returned ' + docs.length + ' session docs');
    docs.forEach(function(sessionDoc) {
      logSocket(socket, 'session ' + sessionDoc.sessionId + ' full (find)');
      socket.emit('session_full', sessionDoc);
    });
  });
}

function retrieveTestLogParts(socket, session, module) {
  let match = {'sessionId': parseInt(session), 'moduleName': module};
  const linksPromise = _db.collection('loglinks').find(match).toArray();
  linksPromise
    .then(function testLogLinks(links) {
      console.log('Found ' + links.length + ' loglink docs');
      let allLogLinks = [];
      for (let i = 0, len = links.length; i < len; i++) {
        console.log('Test: ' + links[i].testName + ' - Number of log links:' +
          ' ' + links[i].logIds.length);
        Array.prototype.push.apply(allLogLinks, links[i].logIds);
      }
      console.log('Total logs for module: ' + allLogLinks.length);
      match = {'_id': {'$in': allLogLinks}};
      // Now retrieve the logs from the list of _id's
      return _db.collection('testlogs').find(match).toArray();
    })
    .then(function testLogs(logs) {
      console.log('Number of log message docs retrieved: ' + logs.length);
      while (logs.length>0) {
        // Currently 500 message chunks gives the best client side performance
        socket.emit('saved messages', logs.splice(0, 500));
      }
      console.log('Done - all test logs emitted');
    })
    .catch(function whenErr(err) {
      console.log('Error');
      console.log(err);
    });

  let pipeline = [
    {"$match": match},
    {
      "$project": {
        moduleTests: 1, moduleFixtures: 1, "classes.className": 1,
        "classes.classTests": 1, "classes.classFixtures": 1
      }
    }
  ];
  let verifications = [];
  const aggPromise = _db.collection('modules').aggregate(pipeline).toArray();
  aggPromise
    .then(function module(items) {
      console.log('Aggregation outcome');
      console.log(items);
      // Array should always be length 1 when specifying session and module
      if (items.length !== 1) {
        console.log('Error: length of aggregation result is not 1 (' + items.length + ')');
      }
      // Collect all the Oids for tests and fixtures
      let testOids = [];  // Module and class test function results
      let fixtureOids = [];  // Module and class scoped fixtures
      testOids.push.apply(testOids, items[0].moduleTests);
      fixtureOids.push.apply(fixtureOids, items[0].moduleFixtures);
      for (let i = 0, len = items[0].classes.length; i < len; i++) {
        console.log(items[0].classes[i]);
        testOids.push.apply(testOids, items[0].classes[i].classTests);
        fixtureOids.push.apply(fixtureOids, items[0].classes[i].classFixtures);
      }
      console.log('Fixture OIds');
      console.log(fixtureOids);  // Still need to get the test scoped fixtures
      console.log('Test OIds');
      console.log(testOids);
      let matchTest = {'_id': {'$in': testOids}};
      let matchFix = {'_id': {'$in': fixtureOids}};
      return Promise.all([_db.collection('testresults').find(matchTest).toArray(),
                          _db.collection('fixtures').find(matchFix).toArray()])
    })
    .then(function testsAndHigherFixtures(items) {
      // *** [[module and class testresults], [module and class scoped
      // fixtures]] ***
      // TODO check for null - no results found
      console.log('Found tests (array)');
      console.log(items[0]);
      console.log('Found class and module fixtures (array)');
      console.log(items[1]);
      // All verifications - class and module scoped fixtures
      console.log('setup verifications (module and class):');
      for (let i = 0, len = items[1].length; i < len; i++) {
        verifications.push.apply(verifications, items[1][i].setupVerifications);
      }
      console.log('teardown verifications (module and class):');
      for (let i = 0, len = items[1].length; i < len; i++) {
        verifications.push.apply(verifications, items[1][i].teardownVerifications);
      }
      console.log('test call verifications:');
      for (let i = 0, len = items[0].length; i < len; i++) {
        verifications.push.apply(verifications, items[0][i].callVerifications);
      }
      let testFixturesOids = [];
      for (let i = 0, len = items[0].length; i < len; i++) {
        testFixturesOids.push.apply(testFixturesOids, items[0][i].functionFixtures);
      }
      console.log('Test Fixture OIds');
      console.log(testFixturesOids);
      let matchFix = {'_id': {'$in': testFixturesOids}};
      return _db.collection('fixtures').find(matchFix).toArray();
    })
    .then(function testFixtures(testsFixtures) {
      console.log('setup verifications (function):');
      for (let i = 0, len = testsFixtures.length; i < len; i++) {
        verifications.push.apply(verifications, testsFixtures[i].setupVerifications);
      }
      console.log('teardown verifications (function):');
      for (let i = 0, len = testsFixtures.length; i < len; i++) {
        verifications.push.apply(verifications, testsFixtures[i].teardownVerifications);
      }
      console.log(verifications.length);
      verifications.sort(function(a, b) {
        return a.timestamp - b.timestamp;
      });
      console.log('Sorted verification (all from module):');
      for (let i = 0, len = verifications.length; i < len; i++) {
        console.log(verifications[i].verifyMsg + ' ' + verifications[i].timestamp);
      }
      socket.emit('all verifications', verifications);
    })
    .catch(function whenErr(err) {
      console.log('Error');
      console.log(err);
    });
}

// connect to mongoDB database
MongoClient.connect('mongodb://nz-atsmongo1,nz-atsmongo2,nz-atsmongo3/?replicaSet=replSet1', (err, database) => {
  // ... start the server
  if (err) {
    return console.log(err);
  }
  console.log('Connected to db ' + db_name);
  _db = database.db(db_name);
  http.listen(port, function(){
    console.log('listening on *:' + port);
  });

  database.on('authenticated', (auth) => {
    console.log("MongoDB authentication event");
    console.log(auth);
  });

  database.on('close', (err) => {
    console.log("MongoDB close event");
    console.log(err);
  });

  database.on('error', (err) => {
    console.log("MongoDB error event");
    console.log(err);
  });

  database.on('parseError', (err) => {
    console.log("MongoDB BSON parse error event");
    console.log(err);
  });

  database.on('reconnect', (con) => {
    console.log("MongoDB reconnect event");
    console.log(con);
  });

  database.on('timeout', (err) => {
    console.log("MongoDB socket timeout event");
    console.log(err);
  });
});
