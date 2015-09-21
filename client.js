'use strict'

console.log('test')
var fetch = require('node-fetch')

function checkStatus (response) {
  if (response.status >= 200 && response.status < 300) {
    return response
  } else {
    var error = new Error(response.statusText)
    error.response = response
    throw error
  }
}

function parseJSON (response) {
  return response.json()
}

// /rest/system/config -> devices, folders
// /rest/system/status -> myID
// /rest/db/completion [device, folder] -> % !expensive call!

var myID = ''
var deviceList = {}
var folderList = {}
var completion = {}
var connections = {}

fetch('http://localhost:8080/rest/system/status').then(checkStatus).then(parseJSON)
  .then(function (status) {
    myID = status.myID
    return fetch('http://localhost:8080/rest/system/config').then(checkStatus).then(parseJSON)
  })
  .then(function (config) {
    config.devices.forEach(addDevice)
    config.folders.forEach(addFolder)
    return fetch('http://localhost:8080/rest/system/connections').then(checkStatus).then(parseJSON)
  })
  .then(function (json) {
    for (var deviceID in json.connections) {
      connections[deviceID] = true
      updateDeviceStatus(deviceID)
    }
    handleEvents([])
  })

var handleEvents = function (events) {
  var since, limit
  try {
    console.debug('received ' + events.length + ' events: ', events)
    events.forEach(handleEvent)
    console.log(events[events.length - 1].id)
    since = events[events.length - 1].id
    limit = 0
  } catch(e) {
    since = 0
    limit = 1
  } finally {
    fetch('http://localhost:8080/rest/events?since=' + since + '&limit=' + limit).then(checkStatus).then(parseJSON)
    .then(handleEvents)
    .catch(function (reason) { console.log(reason); handleEvents([]) })
  }
}

var handleEvent = function (e) {
  switch (e.type) {
    case 'DeviceConnected':
      connections[e.data.id] = true
      updateDeviceStatus(e.data.id)
      break
    case 'DeviceDisconnected':
      delete connections[e.data.id]
      updateDeviceStatus(e.data.id)
      break
    case 'DownloadProgress':
      for (var folder in e.data)
        refreshCompletion(myID, folder)
      break
    case 'FolderCompletion':
      completion[e.data.device][e.data.folder] = e.data.completion
      updateDeviceStatus(e.data.device)
      updateFolderStatus(e.data.folder)
      break
    case 'RemoteIndexUpdated':
      refreshCompletion(myID, e.data.folder)
      break
    case 'StateChanged':
      if (folderList[e.data.folder]) {
        folderList[e.data.folder].state = e.data.to
        updateFolderStatus(e.data.folder)
      }
      break
  }
}

var addDevice = function (config) {
  if (config.deviceID !== myID) {
    var device = document.createElement('syncthing-device')
    device.setAttribute('id', config.deviceID)
    device.setAttribute('data-status', 'disconnected') // TODO add "unknown" as default in component?
    device.textContent = config.name
    document.getElementById('device-list').appendChild(device)
  }
  deviceList[config.deviceID] = config
  completion[config.deviceID] = {}
}

var addFolder = function (config) {
  var folder = document.createElement('syncthing-folder')
  folder.setAttribute('id', config.id)
  folder.setAttribute('data-status', 'unknown')
  folder.textContent = config.id
  document.getElementById('folder-list').appendChild(folder)

  folderList[config.id] = config
  folderList[config.id].devices.forEach(function (device) {
    refreshCompletion(device.deviceID, this.id)
  }.bind(config))
}

var updateDeviceStatus = function (deviceID) {
  console.debug('update device ' + deviceID)
  var status = 'disconnected'
  if (deviceFolders(deviceID).length === 0) { status = 'unused' }
  if (connections[deviceID]) {
    status = 'insync'
    for (var folderID in completion[deviceID]) {
      if (completion[deviceID][folderID] !== 100) { status = 'syncing' }
    }
  }
  document.querySelector('syncthing-device#' + deviceID).setAttribute('data-status', status)
  var c = 0
  for (var i in completion[deviceID]) {
    c += completion[deviceID][i]
  }
  c /= Object.keys(completion[deviceID]).length
  c = Math.round(c)
  console.debug(deviceID + ' completion ' + c)
  // document.querySelector('syncthing-device#' + deviceID).setAttribute('data-completion', c)
  document.querySelector('syncthing-device#' + deviceID).shadowRoot.querySelector('#status').setAttribute('data-completion', c)
}

var updateFolderStatus = function (folderID) {
  console.debug('update folder ' + folderID)
  var status = 'unknown'
  if (folderList[folderID].state) { status = folderList[folderID].state }
  if (folderList[folderID].devices.length <= 1) { status = 'unshared' }
  if (folderList[folderID].invalid !== '') { status = 'stopped' }
  document.querySelector('syncthing-folder#' + folderID).setAttribute('data-status', status)
  var c = completion[myID][folderID]
  c = Math.round(c)
  console.debug(folderID + ' completion ' + c)
  // document.querySelector('syncthing-folder#' + folderID).setAttribute('data-completion', c)
  document.querySelector('syncthing-folder#' + folderID).shadowRoot.querySelector('#status').setAttribute('data-completion', c)
}

var debouncedFuncs = {}

var refreshCompletion = function (deviceID, folderID) {
  var key = 'refreshCompletion-' + deviceID + '-' + folderID
  if (!debouncedFuncs[key]) {
    debouncedFuncs[key] = debounce(function () {
      _refreshCompletion(deviceID, folderID)
    }, 1000, true)
  }
  debouncedFuncs[key]()
}

var _refreshCompletion = function (deviceID, folderID) {
  console.debug('refresh ' + deviceID + ' ' + folderID)
  if (deviceID === myID) {
    fetch('http://localhost:8080/rest/db/status?folder=' + folderID)
    .then(checkStatus).then(parseJSON)
    .then(function (json) {
      var c = json.localBytes / json.globalBytes * 100
      c = c > 100 ? 100 : c
      completion[deviceID][folderID] = c
      folderList[folderID].state = json.state
      updateDeviceStatus(deviceID)
      updateFolderStatus(folderID)
    })
  } else {
    fetch('http://localhost:8080/rest/db/completion?device=' + deviceID + '&folder=' + folderID)
    .then(checkStatus).then(parseJSON)
    .then(function (json) {
      completion[deviceID][folderID] = json.completion
      updateDeviceStatus(deviceID)
      updateFolderStatus(folderID)
    })
  }
}

function debounce (func, wait) {
  var timeout, args, context, timestamp, result, again

  var later = function () {
    var last = Date.now() - timestamp
    if (last < wait) {
      timeout = setTimeout(later, wait - last)
    } else {
      timeout = null
      if (again) {
        again = false
        result = func.apply(context, args)
        context = args = null
      }
    }
  }

  return function () {
    context = this
    args = arguments
    timestamp = Date.now()
    if (!timeout) {
      timeout = setTimeout(later, wait)
      result = func.apply(context, args)
      context = args = null
    } else {
      again = true
    }

    return result
  }
}

var deviceFolders = function (deviceID) {
  var folders = []
  for (var folderID in folderList) {
    var devices = folderList[folderID].devices
    for (var i = 0; i < devices.length; i++) {
      if (devices[i].deviceID === deviceID) {
        folders.push(folderID)
        break
      }
    }
  }
  folders.sort()
  return folders
}
