let reserve = (function() {
  let reserve = {
    socket: undefined,
    connected: false,
    ip: undefined,
    userLongName: undefined,
    userAdmin: 'Jenkins Test'
  };
  reserve.resetSocket = function() {
    this.socket = io('/reservations');
  };

  reserve.reserveReleaseTestRig = function(element) {
    // console.log(action + ' test rig ' + testrig);
    let action = element.getAttribute("data-action");
    let testrig = element.getAttribute("data-testrig");
    let device = element.getAttribute("data-device");
    console.log('action: ' + action + ', testrig: ' + testrig + ', device: '
      + device);
    if (reserve.userLongName) {
      reserve.socket.emit(action.toLowerCase(), {
        user: reserve.userLongName,
        testrig: testrig,
        device: device
      });
    } else {
      // Shouldn't ever see this as button should always be disabled in
      // this case.
      alert('ERROR: User name not defined');
    }
  };

  reserve.deviceTemplate = function(data, singleDevice, testrigName="",
                                    deviceLinks=[], testerLinks=[], testrigId) {  //FIXME
    let action = 'Reserve';
    let buttonStatus;
    // let buttonClass;
    let prevUser = "";
    // let prevIp = "";
    let prevStart = "";
    let prevEnd = "";
    let currentUser = "";
    // let currentIp = "";
    let currentStart = "";
    let rowClass = "device";
    let links = "";
    let tester = "";
    if (Object.entries(data.reservations[0]).length !== 0) {
      if (data.reservations[0].hasOwnProperty('end')) {
        // No current user - index 0 is the previous user
        currentUser = '';
        // currentIp = '';
        currentStart = '';
        action = 'Reserve';
        buttonStatus = '';
        // buttonClass = "res-rel-button";
        // prevIp = data.reservations[0].ip;
        prevUser = data.reservations[0].user;
        prevStart = formatDateTime(data.reservations[0].start);
        prevEnd = formatDateTime(data.reservations[0].end);
      } else {
        console.log('Processing:::::: ' + data.longName);
        // Test rig is reserved
        currentUser = data.reservations[0].user;
        currentStart = formatDateTime(data.reservations[0].start);
        action = 'Release';
        if (reserve.userLongName !== currentUser && reserve.userLongName !== 'Jenkins' +
          ' Test') {
          buttonStatus = 'disabled';
        }
        // if (currentUser === reserve.userLongName) {
        //   action = 'Release';
        // } else {
        //   buttonStatus = 'disabled';
        // }
        prevUser = data.reservations[1].user;
        prevStart = formatDateTime(data.reservations[1].start);
        prevEnd = formatDateTime(data.reservations[1].end);
      }
    } else {
      action = 'Reserve';
      buttonStatus = '';
    }
    if ($('#loginButton').attr('data-signin') === '') {
      // Not logged in so disable ALL buttons
      buttonStatus = 'disabled';
      // buttonClass = "disabled-button";
    }

    if (singleDevice) {
      rowClass = "testrig";
    } else {
      testrigName = '';
    }

    if (deviceLinks.length > 0) {
      links = deviceLinks.join('<br>');
    }

    if (testerLinks.length > 0) {
      tester = testerLinks.join('<br>');
    }
    console.log(tester);

    return `
    <tr id="${data.longName}_row" class=${rowClass}>
      <td id="${data.longName}_testrig">${testrigName}</td>
      <td id="${data.longName}_name">${data.longName}</td>
      <td id="${data.longName}_type">${data.hardware.type}</td>
      <td id="${data.longName}_links">${links}</td>
      <td id="${data.longName}_lx">${data.linux.ip}</td>
      <td id="${data.longName}_mng">${data.management.ip}</td>
      <td id="${data.longName}_pwr">${data.powerSwitch.ip}/${data.powerSwitch.outlet}</td>
      <td id="${data.longName}_tester">${tester}</td>
      <td style="padding: 0; background-color: white">
        <input id="${data.longName}" type="button" value=${action} data-testrig="${testrigId}"
        data-device="${data.longName}" data-action="${action}" onclick="reserve.reserveReleaseTestRig(this)"
        style="display: inline-block; position: relative; width:100%; 
        height: 100%; padding: 4px;" class="res-rel-button" ${buttonStatus}>
      </td>
      <td id="${data.longName}_user">${currentUser}</td>
      <td id="${data.longName}_start">${currentStart}</td>
      <td id="${data.longName}_prev_user">${prevUser}</td>
      <td id="${data.longName}_prev_start">${prevStart}</td>
      <td id="${data.longName}_prev_end">${prevEnd}</td>
    </tr>
    `;
  };

  reserve.testRigTemplate = function(id, description) {
    let buttonStatus = 'disabled';
    if (reserve.userLongName === 'Jenkins Test') {
      buttonStatus = '';
    }

    return `
    <tr id="${id}_row" class="testrig">
      <td id="${id}_testrig">${description}</td>
      <td id="${id}_name"></td>
      <td id="${id}_type"></td>
      <td id="${id}_links"></td>
      <td id="${id}_lx"></td>
      <td id="${id}_mng"></td>
      <td id="${id}_pwr"></td>
      <td id="${id}_tester"></td>
      <td style="display: flex; padding: 0; background-color: white">
        <input id="${id}_reserve" type="button" value="Reserve All" data-testrig="${id}"
        data-device="" data-action="Reserve" onclick="reserve.reserveReleaseTestRig(this)"
        style="display: inline-block; position: relative; width:50%; 
        height: 100%; padding: 4px;" class="res-rel-testrig" ${buttonStatus}>
        <input id="${id}_release" type="button" value="Release All" data-testrig="${id}"
        data-device="" data-action="Release" onclick="reserve.reserveReleaseTestRig(this)"
        style="display: inline-block; position: relative; width:50%; 
        height: 100%; padding: 4px;" class="res-rel-testrig" ${buttonStatus}>
      </td>
      <td id="${id}_user"></td>
      <td id="${id}_start"></td>
      <td id="${id}_prev_user"></td>
      <td id="${id}_prev_start"></td>
      <td id="${id}_prev_end"></td>
    </tr>
    `;
  };

  reserve.testRigUpdate = function(testrig) {
    console.log(testrig);
    let numOfDevices = testrig.devices.length;
    if (numOfDevices === 1) {
      console.log("Single device testrig");
      let testerConnections = Array();
      if (testrig.devices[0].hasOwnProperty("ethernetTester")) {
        for (let j=0; j < testrig.devices[0].ethernetTester.ports.length; j++) {
          let connection = testrig.devices[0].ethernetTester.ports[j];
          testerConnections.push(connection.deviceInterface + '<->' +
            connection.testerInterface + ' ' + testrig.devices[0].ethernetTester.type
            + ' ' + testrig.devices[0].ethernetTester.ip);
        }
      }
      console.log(testerConnections);
      $('#testrigs tr:last').after(
        this.deviceTemplate(testrig.devices[0], true,
          testrigName=testrig.description, deviceLinks=[],
          testerLinks=testerConnections, testrig._id)
      );
    } else {
      console.log("Add row for the parent testrig " + testrig.name);
      $('#testrigs tr:last').after(
        this.testRigTemplate(testrig._id, testrig.description)
      );
      for (let i=0; i < numOfDevices; i++) {
        let device = testrig.devices[i];
        let deviceLinks = Array();
        for (let i=0; i < testrig.links.length; i++) {
          console.log(Object.values(testrig.links[i]));
          if (Object.values(testrig.links[i]).indexOf(device.longName) !== -1) {
            deviceLinks.push(testrig.links[i].nearDevice + "/" +
              testrig.links[i].nearInterface + "<->" +
              testrig.links[i].farDevice + "/" +
              testrig.links[i].farInterface);
          }
        }
        let testerConnections = Array();
        if (testrig.devices[i].hasOwnProperty("ethernetTester")) {
          for (let j=0; j < testrig.devices[i].ethernetTester.ports.length; j++) {
            let connection = testrig.devices[i].ethernetTester.ports[j];
            testerConnections.push(connection.deviceInterface + '<->' +
              connection.testerInterface + ' ' + testrig.devices[i].ethernetTester.type
              + ' ' + testrig.devices[i].ethernetTester.ip);
          }
        }
        console.log(testerConnections);
        console.log(deviceLinks);
        console.log("Add row for child device " + device.longName);
        $('#testrigs tr:last').after(
          this.deviceTemplate(testrig.devices[i], false,
            testrigName = testrig.name, deviceLinks = deviceLinks,
            testerConnections = testerConnections, testrig._id)
        );
        // TODO if device is reserved by current user enable release all
        // TODO if device is free enable reserve all
        if (reserve.userLongName !== undefined) {
          if (testrig.devices[i].reservations[0].user === reserve.userLongName &&
              !testrig.devices[i].reservations[0].hasOwnProperty('end')) {
            $('#' + testrig._id + '_release').prop('disabled',
              reserve.checkButtonState(false));
          } else if (testrig.devices[i].reservations[0].hasOwnProperty('end')) {
            $('#' + testrig._id + '_reserve').prop('disabled',
              reserve.checkButtonState(false));
          }
        }
      }
    }
  };

  reserve.checkButtonState = function(disabled) {
    console.log("Current logged in user: " + reserve.userLongName);
    console.log("Admin user: " + reserve.userAdmin);
    if (reserve.userLongName === reserve.userAdmin) {
      // Admin user buttons are always enabled.
      return false;
    } else if (reserve.userLongName === undefined) {
      // No user is signed in, all buttons are disabled.
      return true;
    } else {
      // Non-admin user is logged in so return the original state.
      return disabled;
    }
  }

  reserve.updateCurrReservation = function(testrig, user, start, action,
                                           disabled) {
    let startParsed = formatDateTime(start);
    $('#' + testrig + '_user').text(user);
    $('#' + testrig + '_start').text(startParsed);
    $('#' + testrig)
      .val(action)
      .attr("data-action", action)
      .prop('disabled', reserve.checkButtonState(disabled));  // TODO change
    // color/class
  };

  reserve.updatePrevReservation = function(testrig, user, start, end) {
    let startParsed = formatDateTime(start);
    let endParsed = formatDateTime(end);
    $('#' + testrig + '_prev_user').text(user);
    $('#' + testrig + '_prev_start').text(startParsed);
    $('#' + testrig + '_prev_end').text(endParsed);
  };

  reserve.signIn = function() {
    console.log('Signing In');
    console.log('Username: ' + $('#user').val());
    console.log('Password: ' + $('#pass').val());
    reserve.socket.emit('login', {
      user: $('#user').val(),
      pass: $('#pass').val()
    });
  };

  reserve.signInOut = function() {
    // Open sign in dialog or sign out
    let signIn = $('#loginButton').attr('data-signin');
    console.log('Button state is: ' + signIn);
    if (signIn === '') {
      // Display the login modal dialog - signIn fired from button in modal
      $('#loginModal').show();
    } else {  // (typeof signIn !== typeof undefined && signIn !== false)
      // Sign out
      console.log('Signing Out');
      // Remove the username and password from the login dialog
      $('#user').val('');
      $('#pass').val('');
      reserve.userLongName = undefined;
      // Make all buttons inactive
      $('.res-rel-button').prop('disabled', true);
      $('.res-rel-testrig').prop('disabled', true);
      $('#loginButton').attr('data-signin', '');
      $('#loginButton').text('Sign In');
    }
  };

  reserve.passwordKeypress = function(event) {
    if(event.which == 13 || event.keyCode == 13) {
      reserve.signIn();
    }
  };

  reserve.exitLogin = function() {
    $('#loginModal').hide();
  };

  return reserve;
})();

function formatDateTime(dateTimeISOStr) {
  let parsed = '';
  if (dateTimeISOStr) {
    let dateTime = new Date(dateTimeISOStr);
    let time = dateTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    let date = dateTime.toDateString();
    parsed = date + ' ' + time;
  }
  return parsed;
}

$(window).ready(function() {
  reserve.resetSocket();
  reserve.socket.on('connect', function() {
    console.log("Reservation client connected");
    if (reserve.connected) {
      console.log("Don't re-initialize page");
    } else {
      reserve.connected = true;
      reserve.socket.emit('init');
    }
  });

  reserve.socket.on('all_rigs', (data) => {
    console.log("All test rig info received");
    console.log(data);
    for (let i = 0, len = data.testrigs.length; i < len; i++) {
      reserve.testRigUpdate(data.testrigs[i]);
    }
  });

  reserve.socket.on('device reserved', (data) => {
    console.log('Device ' + data.device + ' (in test rig ' + data.testrig +
      ') reserved by ' + data.user + ' (current client: ' + reserve.userLongName + ')');
    console.log(data);
    let action = 'Reserve';
    let disable = false;
    if (data.user === reserve.userLongName) {
      // This client has the reservation
      action = 'Release';
      $('#' + data.testrig + '_release').prop('disabled',
        reserve.checkButtonState(false));
    } else {
      disable = true;
      // $('#' + data.testrig + '_reserve').prop('disabled', true);
      // TODO needs to check if all the testrig devices are reserved
    }
    if (data.allReserved) {
      $('#' + data.testrig + '_reserve').prop('disabled',
        reserve.checkButtonState(true));
    }

    reserve.updateCurrReservation(data.device, data.user, data.start, action, disable);
    reserve.updatePrevReservation(data.device, data.prevRes.user, data.prevRes.start, data.prevRes.end);
  });

  reserve.socket.on('testrig reserved', (data) => {
    console.log('Test rig  ' + data.testrig + ' reserved by ' + data.user +
      ' (current client: ' + reserve.userLongName + ')');

    console.log(data);
    let action = 'Reserve';
    let disable = false;
    if (data.user === reserve.userLongName) {
      // This client has the reservation
      action = 'Release';
      $('#' + data.testrig + '_release').prop('disabled',
        reserve.checkButtonState(false));
    } else {
      disable = true;
    }
    $('#' + data.testrig + '_reserve').prop('disabled',
      reserve.checkButtonState(true));

    for (let i=0; i<data.devices.length; i++) {
      reserve.updateCurrReservation(data.devices[i].name, data.user, data.start, action, disable);
      reserve.updatePrevReservation(data.devices[i].name, data.devices[i].prevRes.user, data.devices[i].prevRes.start, data.devices[i].prevRes.end);

    }
  });

  reserve.socket.on('released', (data) => {
    console.log(data);
    if (data.allAvailable) {
      console.log('Testrig ' + data.testrig + ' released all devices');
      $('#' + data.testrig + '_release').prop('disabled',
        reserve.checkButtonState(true));
    } else {
      console.log('Testrig ' + data.testrig + ' released some devices');
    }
    // Enable the reserve all button for the associated testrig as at least
    // 1 device can be reserved.
    if (data.devices.length > 0) {
      $('#' + data.testrig + '_reserve').prop('disabled',
        reserve.checkButtonState(false));
    }

    for (let i=0; i<data.devices.length; i++) {
      // update all devices (with end time) - if in reserved state
      // move current user and since to prev user and from + add end time to to
      console.log('Updating device ' + data.devices[i].name + '');
      let prevUser = $('#' + data.devices[i].name + '_user').text();
      let prevStart = $('#' + data.devices[i].name + '_start').text();
      if (prevUser !== '') {
        $('#' + data.devices[i].name + '_prev_user').text(prevUser);
        $('#' + data.devices[i].name + '_prev_start').text(prevStart);
        $('#' + data.devices[i].name + '_prev_end').text(formatDateTime(data.devices[i].endTime));
        $('#' + data.devices[i].name + '_user').text('');
        $('#' + data.devices[i].name + '_start').text('');
        $('#' + data.devices[i].name)
          .val("Reserve")
          .attr("data-action", "Reserve")
          .prop('disabled', reserve.checkButtonState(false));
      }
    }
  });

  reserve.socket.on('login auth', (data) => {
    console.log(data);
    if (data.success === true) {
      reserve.userLongName = data.longName;
      $('#loginButton').text(data.longName + ' Sign Out');
      $('#loginButton').removeAttr('data-signin');
      // Remove the testrig table data rows and re-initialize.
      $('table tr').not(':nth-child(1)').remove();
      reserve.connected = true;
      reserve.socket.emit('init');
      $('#loginModal').hide();
    } else {
      // Login failed
      alert(data.msg);
    }
  });

  // When the user clicks anywhere outside of the modal, close it
  window.onclick = function(event) {
    if (event.target == $('#loginModal')) {
      $('#loginModal').hide();
    }
  };
});
