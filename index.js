'use strict'

var gui = require('nw.gui')

var $ = function (selector) { return document.querySelector(selector) }

var tray = new gui.Tray({
  title: '',
  icon: 'tray.png',
  alticon: '',
  tooltip: window.document.title,
  iconsAreTemplates: true
})

var visible = false
var show = function () {
  visible = true
  var w = gui.Window.get()
  w.show()
  w.focus()
}
var hide = function () {
  visible = false
  gui.Window.get().hide()
}
var toggle = function () {
  if(visible) {
    hide()
  } else {
    show()
  }
}

tray.on('click', function (position) {
  var w = gui.Window.get()
  position.x -= Math.floor(w.width / 2 - 12)
  w.moveTo(position.x, position.y)
  w.resizeBy(0, 1)
  w.resizeBy(0, -1)
  toggle()
})

gui.Window.get().on('blur', function () { hide() })

var settings_window = gui.Window.open('settings.html', {
  width: 600,
  height: 400,
  show: false,
  frame: true,
  transparent: false,
  resizable: false,
  toolbar: false,
  show_in_taskbar: false
})

settings_window.on('close', function () { this.hide() })

document.addEventListener('DOMContentLoaded', function () {
  var w = gui.Window.get()
  $('#settings_button').addEventListener('click', function () {
    settings_window.show()
    hide()
    settings_window.focus()
  })
})
