$(window).ready(function() {
  let sessionId = localStorage.getItem("sessionId");
  // null if not stored - server gets ID for NEXT (not started) session
  console.log("Session page with saved ID " + sessionId);
  $('#sessionId').val(sessionId);

  // let socket = io.connect('', {query: 'page=session'});
  let socket = io();
  socket.on('connect', function () {
    console.log("Session Client connected");
    socket.emit('from', {
      page: 'session',
      sessionId: sessionId
    });
  });

  socket.on('session_full', (data) => {
    console.log(data);
    console.log('Collected tests: ' + data.collected);
    console.log('Collected tests #: ' + data.collected.length);
    $('#sessionTitle').text('Session ' + data.sessionId + ' collected '
      + data.collected.length + ' tests');
    $('#plan').text('Test plan: ' + data.plan);
    $('#status').text(data.status);

  });

  let moduleName = '';
  let className = '';
  let testName = '';

  socket.on('session_update', (data) => {
    console.log(data);
    if (data.hasOwnProperty('updatedFields')) {
      // TODO process this at the server end instead - just for array elements like runOrder
      Object.entries(data.updatedFields).forEach(function(k) {
        if (k[0].indexOf('runOrder') === 0) {
          // attribute starts with runOrder
          console.log(k);
          console.log("Found - " + k[0]);

          let re = /runOrder\.?(?<index>\d*)\.?(?<param>\w*)/gm;
          let my = re.exec(k[0]);
          console.log(my);
          let runOrderIndex = my.groups.index;
          let runOrderParam = my.groups.param;

          if (!runOrderIndex) {
            console.log('runOrder with no index detected - element 0');
            $('#module').text(k[1][0].moduleName);
            $('#class').text(k[1][0].className);
            $('#test').text(k[1][0].testName);
            runOrderIndex = 0;
            $('<li>', {
              id: 'test_' + runOrderIndex
            }).append([
              $('<p>', {
                id: "name_" + runOrderIndex,
                text: k[1][0].testName
              }).css({
                display: "inline"
              }),
              $('<p>', {
                id: "outcome_" + runOrderIndex,
                text: ":  " + k[1][0].outcome
              }).css({
                display: "inline"
              })
            ]).appendTo($('#testsList'));
          } else if (runOrderParam) { // TODO param update to first test?
            console.log('runOrder ' + runOrderIndex + ' param update - ' +
              runOrderParam + ': ' + k[1]);
            if (runOrderParam === "status" && k[1] === "complete") {
              $('#outcome_' + runOrderIndex).css('font-weight', 'bold');
            } else {
              $('#' + runOrderParam + "_" + runOrderIndex).text(':  ' +
                k[1]);
            }
          } else {
            console.log('runOrder full update/insert for index ' +
              runOrderIndex);

            $('#module').text(k[1].moduleName);
            $('#class').text(k[1].className);
            $('#test').text(k[1].testName);

            $('<li>', {
              id: 'test_' + runOrderIndex
            }).append([
              $('<p>', {
                id: "name_" + runOrderIndex,
                text: k[1].testName
              }).css({
                display: "inline"
              }),
              $('<p>', {
                id: "outcome_" + runOrderIndex,
                text: ":  " + k[1].outcome
              }).css({
                display: "inline"
              })
            ]).appendTo($('#testsList'));
          }
        }
        if (k[0] === 'status') {
         $('#status').text(k[1]);
        }
        if (k[0] === 'progress.phase') {
          $('#phase').text(k[1]);
        }
        // if (k[0] === 'progress.activeSetups') { // list as above
        //
        // }
        if (k[0] === 'progress.completed') {
          console.log(k[1]);
          if (k[1].hasOwnProperty('moduleName')) {
            moduleName = k[1].moduleName;
          }
          if (k[1].hasOwnProperty('className')) {
            className = k[1].className;
          }
          if (k[1].hasOwnProperty('testName')) {
            testName = k[1].testName;
          }
          $('#complete').append('<p>' + moduleName + ' :: ' + className +
            ' :: ' + testName + ' :: ' +  k[1].fixtureName + ' :: ' +
            k[1].phase + ' :: ' + k[1].outcome + ' :: ' +
            k[1].verifications + '</p>');

          // Scroll to bottom
          let scrollH = $('#complete').prop('scrollHeight');
          console.log("Scroll height: " + scrollH);
          $('#complete').scrollTop(scrollH);
        }
      });
    }
  });
});


function saveSessionId() {
  let sessionId = $('#sessionId').val();
  localStorage.setItem("sessionId", sessionId);
  console.log("Set session ID to " + localStorage.getItem("sessionId"));
  location.reload();
}