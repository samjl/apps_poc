let reserve = (function() {
  let reserve = {
    socket: undefined,
    ip: undefined
  };
  reserve.resetSocket = function() {
    this.socket = io('/reservations');
  };
  reserve.reserveReleaseTestRig = function(testrig, action) {
    console.log(action + ' test rig ' + testrig)
    reserve.socket.emit(action.toLowerCase(), {
      user: $('#user').val(),
      testrig: testrig
    });
  };

  reserve.checkUserAnon = function(user, ip) {
    let userChecked = user;
    if (userChecked === '') {
      userChecked = 'Anonymous';
      if (ip === reserve.ip) {
        userChecked += ' (you)';
      }
    }
    return userChecked
  };

  reserve.testRigTemplate = function(data) {
    let action;
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
      prevIp = reserve.ipv6Toipv4(data.reservations[0].ip);
      prevUser = reserve.checkUserAnon(data.reservations[0].user, prevIp);
      prevStart = data.reservations[0].start;
      prevEnd = data.reservations[0].end;
    } else {
      // Test rig is reserved
      currentIp = reserve.ipv6Toipv4(data.reservations[0].ip);
      currentUser = reserve.checkUserAnon(data.reservations[0].user, currentIp);
      currentStart = data.reservations[0].start;
      if (currentIp === reserve.ip) {
        action = 'Release';
      } else if (currentIp !== 'none') {
        buttonStatus = 'disabled';
      }
      prevIp = reserve.ipv6Toipv4(data.reservations[1].ip);
      prevUser = reserve.checkUserAnon(data.reservations[1].user, prevIp);
      prevStart = data.reservations[1].start;
      prevEnd = data.reservations[1].end;
    }

    return `
    <tr id="${data.name}_row">
      <td id="${data.name}_name">${data.name}</td>
      <td id="${data.name}_lx">${data.nodes[0]['linux-ip-address']}</td>
      <td id="${data.name}_mng">${data.nodes[0]['management-ip-address']}</td>
      <td style="padding: 0;">
        <input id="${data.name}" type="button" value=${action} 
        onclick="reserve.reserveReleaseTestRig(this.id, this.value)" 
        style="display: inline-block; position: relative; width:100%; 
        height: 100%" ${buttonStatus}>
      </td>
      <td id="${data.name}_user">${currentUser}</td>
      <td id="${data.name}_ip">${currentIp}</td>
      <td id="${data.name}_start">${currentStart}</td>
      <td id="${data.name}_prev_user">${prevUser}</td>
      <td id="${data.name}_prev_ip">${prevIp}</td>
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
    $('#' + testrig + '_ip').text(ip);
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

  return reserve;
})();

$(window).ready(function() {
  reserve.resetSocket();
  reserve.socket.on('connect', function() {
    console.log("Reservation client connected");
  });

  reserve.socket.on('all_rigs', (data) => {
    console.log("All test rig info received");
    console.log(data)
    reserve.ip = reserve.ipv6Toipv4(data.client_ip);
    $('#ip').text(' (' + reserve.ip + ')');
    for (let i = 0, len = data.testrigs.length; i < len; i++) {
      reserve.testRigUpdate(data.testrigs[i]);
    }
  });

  reserve.socket.on('update', (data) => {
    console.log(data);
    let updateClientIp = reserve.ipv6Toipv4(data.ip);
    let action = 'Reserve';
    if (updateClientIp === reserve.ip) {
      action = 'Release'
    }
    $('#' + data.testrig + '_user').text(data.user);
    $('#' + data.testrig + '_ip').text(updateClientIp);
    $('#' + data.testrig).val(action);  // TODO change color/class
  });

  reserve.socket.on('reserved', (data) => {
    console.log(data);
    let updateClientIp = reserve.ipv6Toipv4(data.ip);
    let action = 'Reserve';
    let disable = false;
    let user = reserve.checkUserAnon(data.user, updateClientIp);
    if (updateClientIp === reserve.ip) {
      // This client has the reservation
      action = 'Release';
    } else {
      disable = true;
    }
    reserve.updateCurrReservation(data.testrig, user, updateClientIp,
      data.start, action, disable);
    let prevUser = reserve.checkUserAnon(data.prevUser.user,
      reserve.ipv6Toipv4(data.prevUser.ip));
    reserve.updatePrevReservation(data.testrig, prevUser,
      data.prevUser.ip, data.prevUser.start, data.prevUser.end);
  });

  reserve.socket.on('released', (data) => {
    console.log(data);
    let prevUser = reserve.checkUserAnon(data.prevUser.user,
      reserve.ipv6Toipv4(data.prevUser.ip));
    reserve.updateCurrReservation(data.testrig, '', '', '', 'Reserve',
      false);
    reserve.updatePrevReservation(data.testrig, prevUser, data.prevUser.ip,
      data.prevUser.start, data.prevUser.end);
  });
});