/* See license.txt for terms of usage */

define([
],
function() {

"use strict";

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

var appInfo = Cc["@mozilla.org/xre/app-info;1"]
    .getService(Ci.nsIXULAppInfo);
var versionComparator = Cc["@mozilla.org/xpcom/version-comparator;1"]
    .getService(Ci.nsIVersionComparator);
var fx47OrEarlier = (versionComparator.compare(appInfo.version, "47a1") < 0);

const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

Cu.import("resource://gre/modules/NetUtil.jsm");

// ********************************************************************************************* //
// Module

var Channel = {};

Channel.new = function(url)
{
    if (fx47OrEarlier)
    {
        return ioService.newChannel(url, null, null);
    }
    else
    {
      return NetUtil.newChannel({
          uri: url,
          loadUsingSystemPrincipal: true
      });
    }
}

return Channel;

// ********************************************************************************************* //
});
