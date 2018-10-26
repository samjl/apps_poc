'use strict';
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const ldap = require('ldapjs');
const port = process.env.PORT || 3000;

// MongoDB constants and globals
const MongoClient = require('mongodb').MongoClient;
const db_name = 'dev';
let _db;
const testlogs = require('./testlogs');
const sessions = require('./sessions');

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

let tl = io.of('/test');
tl.on('connection', function(socket) {
  logSocket(socket, 'New connection to test logs namespace');
  let tlClient = new testlogs.TestLogClientConn(_db, socket);
  socket.on('disconnect', function(socket) {
    // TODO also cleanup/stop any change streams - test this the null might
    // remove them already?
    if (tlClient.timer) {
      clearInterval(tlClient.timer);
    }
    tlClient = null;
    console.log('Disconnect detected for test logs namespace');
  });
});

let ses = io.of('/session');
ses.on('connection', function(socket) {
  logSocket(socket, 'New connection to session namespace');
  let sesClient = new sessions.SessionDashClientConn(_db, socket);
  socket.on('disonnect', function(socket) {
    sesClient = null;
  })
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

// connect to mongoDB database
MongoClient.connect('mongodb://nz-atsmongo1,nz-atsmongo2,nz-atsmongo3/?replicaSet=replSet1', {useNewUrlParser: true, poolSize: 100}, (err, database) => {
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
