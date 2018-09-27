let reserve = (function() {
  let reserve = {
    socket: undefined,
    ip: undefined,
    userLongName: undefined
  };
  reserve.resetSocket = function() {
    this.socket = io('/reservations');
  };
  reserve.reserveReleaseTestRig = function(testrig, action) {
    console.log(action + ' test rig ' + testrig);
    if (reserve.userLongName) {
      reserve.socket.emit(action.toLowerCase(), {
        user: reserve.userLongName,
        testrig: testrig
      });
    } else {
      // Shouldn't ever see this as button should always be disabled in
      // this case.
      alert('ERROR: User name not defined');
    }
  };

  reserve.testRigTemplate = function(data) {
    let action = 'Reserved';
    let buttonStatus;
    let prevUser;
    let prevIp;
    let prevStart;
    let prevEnd;
    let currentUser;
    let currentIp;
    let currentStart;
    if (data.reservations[0].hasOwnProperty('end')) {
      // No current user - index 0 is the previous user
      currentUser = '';
      currentIp = '';
      currentStart = '';
      action = 'Reserve';
      buttonStatus = '';
      prevIp = data.reservations[0].ip;
      prevUser = data.reservations[0].user;
      prevStart = data.reservations[0].start;
      prevEnd = data.reservations[0].end;
    } else {
      // Test rig is reserved
      currentIp = data.reservations[0].ip;
      currentUser = data.reservations[0].user;
      currentStart = data.reservations[0].start;
      if (currentUser === reserve.userLongName) {
        action = 'Release';
      } else {
        buttonStatus = 'disabled';
      }
      prevIp = data.reservations[1].ip;
      prevUser = data.reservations[1].user;
      prevStart = data.reservations[1].start;
      prevEnd = data.reservations[1].end;
    }
    if ($('#loginButton').attr('data-signin') === '') {
      // Not logged in so disable ALL buttons
      buttonStatus = 'disabled';
    }

    return `
    <tr id="${data.name}_row">
      <td id="${data.name}_name">${data.name}</td>
      <td id="${data.name}_lx">${data.nodes[0]['linux-ip-address']}</td>
      <td id="${data.name}_mng">${data.nodes[0]['management-ip-address']}</td>
      <td style="padding: 0; background-color: white">
        <input id="${data.name}" type="button" value=${action} 
        onclick="reserve.reserveReleaseTestRig(this.id, this.value)" 
        style="display: inline-block; position: relative; width:100%; 
        height: 100%; padding: 4px;" class="reserve-button" ${buttonStatus}>
      </td>
      <td id="${data.name}_user">${currentUser}</td>
      <td id="${data.name}_ip">${reserve.ipv6Toipv4(currentIp)}</td>
      <td id="${data.name}_start">${currentStart}</td>
      <td id="${data.name}_prev_user">${prevUser}</td>
      <td id="${data.name}_prev_ip">${reserve.ipv6Toipv4(prevIp)}</td>
      <td id="${data.name}_prev_start">${prevStart}</td>
      <td id="${data.name}_prev_end">${prevEnd}</td>
    </tr>
    `;
  };
  reserve.testRigUpdate = function(testrig) {
    console.log(testrig.name);
    $('#testrigs tr:last').after(
      this.testRigTemplate(testrig)
    );
  };

  reserve.updateCurrReservation = function(testrig, user, ip, start, action,
                                           disabled) {
    $('#' + testrig + '_user').text(user);
    $('#' + testrig + '_ip').text(reserve.ipv6Toipv4(ip));
    $('#' + testrig + '_start').text(start);
    $('#' + testrig).val(action).prop('disabled', disabled);  // TODO change color/class
  };

  reserve.updatePrevReservation = function(testrig, user, ip, start, end) {
    $('#' + testrig + '_prev_user').text(user);
    $('#' + testrig + '_prev_ip').text(reserve.ipv6Toipv4(ip));
    $('#' + testrig + '_prev_start').text(start);
    $('#' + testrig + '_prev_end').text(end);
  };
  reserve.ipv6Toipv4 = function(ip) {
    return ip.replace('::ffff:', '');
  };

  reserve.signIn = function() {
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
      $('.reserve-button').attr('disabled', 'disabled');
      $('#loginButton').attr('data-signin', '');
      $('#loginButton').text('Sign In');
    }
  };

  reserve.exitLogin = function() {
    $('#loginModal').hide();
  };

  return reserve;
})();

$(window).ready(function() {
  reserve.resetSocket();
  reserve.socket.on('connect', function() {
    console.log("Reservation client connected");
  });

  reserve.socket.on('all_rigs', (data) => {
    console.log("All test rig info received");
    console.log(data);
    $('#ip').text(' (' + reserve.ipv6Toipv4(data.client_ip) + ')');
    for (let i = 0, len = data.testrigs.length; i < len; i++) {
      reserve.testRigUpdate(data.testrigs[i]);
    }
  });

  reserve.socket.on('reserved', (data) => {
    console.log('Test rig  ' + data.testrig + ' reserved by ' + data.user +
      ' (current client: ' + reserve.userLongName + ')');
    console.log(data);
    let action = 'Reserved';
    let disable = false;
    if (data.user === reserve.userLongName) {
      // This client has the reservation
      action = 'Release';
    } else {
      disable = true;
    }
    reserve.updateCurrReservation(data.testrig, data.user, data.ip,
      data.start, action, disable);
    reserve.updatePrevReservation(data.testrig, data.prevUser.user,
      data.prevUser.ip, data.prevUser.start, data.prevUser.end);
  });

  reserve.socket.on('released', (data) => {
    console.log('Test rig  ' + data.testrig + ' released by ' + data.prevUser.user +
      ' (current client: ' + reserve.userLongName + ')');
    console.log(data);
    reserve.updateCurrReservation(data.testrig, '', '', '', 'Reserve',
      false);
    reserve.updatePrevReservation(data.testrig, data.prevUser.user, data.prevUser.ip,
      data.prevUser.start, data.prevUser.end);
  });

  reserve.socket.on('login auth', (data) => {
    console.log(data);
    if (data.success === true) {
      reserve.userLongName = data.longName;
      $('#loginButton').text(data.longName + ' Sign Out');
      $('#loginButton').removeAttr('data-signin');
      $('.reserve-button').each(function() {
        console.log($(this).attr('disabled'));
        console.log($(this).attr('id'));
        if ($(this).attr('value') === 'Reserve') {
          $(this).removeAttr('disabled');
        } else if ($(this).attr('value') === 'Release' || $(this).attr('value') === 'Reserved') {
          if ($('#' + $(this).attr('id') + '_user').text() === reserve.userLongName) {
            if ($(this).attr('value') === 'Reserved') {
              $(this).attr('value', 'Release');
            }
            $(this).removeAttr('disabled');
          }
        }
      });

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