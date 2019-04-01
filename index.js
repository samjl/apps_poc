'use strict';
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;

// MongoDB constants and globals
const MongoClient = require('mongodb').MongoClient;
const db_name = 'dev';
let _db;
const testlogs = require('./apps/testlogs');
const sessions = require('./apps/sessions');
const testRigs = require('./apps/testrigs');


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
  console.log('New connection to reservations namespace from ip ' +
    socket.handshake.address);
  let resClient = new testRigs.ReserveClientConn(_db, socket, res);
  socket.on('disconnect', () => {
    resClient = null;
  });
  socket.on('error', (errData) => {
    console.log('socket error (reservations page)');
    console.log(errData);
    console.log('socket client IP: ' + socket.handshake.address);
  });
});

let tl = io.of('/test');
tl.on('connection', function(socket) {
  console.log('New connection to test logs namespace from ip ' +
    socket.handshake.address);
  let tlClient = new testlogs.TestLogClientConn(_db, socket);
  socket.on('disconnect', () => {
    // TODO also cleanup/stop any change streams - test this the null might
    // remove them already?
    console.log('Disconnection from test logs namespace detected for ip ' +
      socket.handshake.address);
    if (tlClient.timer) {
      clearInterval(tlClient.timer);
    }
    tlClient.closeChangeStreams();
    tlClient = null;
    console.log('Disconnect detected for test logs namespace');
  });
  socket.on('error', (errData) => {
    console.log('socket error (test logs page)');
    console.log(errData);
    console.log('socket client IP: ' + socket.handshake.address);
  });
});

let ses = io.of('/session');
ses.on('connection', function(socket) {
  console.log('New connection to session namespace from ip ' +
    socket.handshake.address);
  let sesClient = new sessions.SessionDashClientConn(_db, socket);
  socket.on('disconnect', () =>  {
    sesClient.closeChangeStreams();
    sesClient = null;
  });
  socket.on('error', (errData) => {
    console.log('socket error (session page)');
    console.log(errData);
    console.log('socket client IP: ' + socket.handshake.address);
  });
});

async function run() {
  try {
    const database = await MongoClient.connect('mongodb://nz-atsmongo1,nz-atsmongo2,nz-atsmongo3/?replicaSet=replSet1', {
      useNewUrlParser: true,
      poolSize: 100
    });
    console.log('Connected to db ' + db_name);
    _db = database.db(db_name);
    http.listen(port, function(){
      console.log('listening on *:' + port);
    });
    database.on('left', data => console.log('MongoClient -> left', data));
    database.on('joined', data => console.log('MongoClient -> joined', data));
    database.on('fullsetup', () => console.log('MongoClient -> all servers' +
      ' connected'));
  } catch(err) {
    console.log('MongoDB connection error: ' + err);
    setTimeout(function() {
      run();
    }, 5000);
  }
}

run();
