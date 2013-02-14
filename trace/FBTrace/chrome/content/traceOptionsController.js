/* See license.txt for terms of usage */

define([
    "fbtrace/trace",
    "fbtrace/lib/object",
    "fbtrace/lib/options",
],
function(FBTrace, Obj, Options) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

var PrefService = Cc["@mozilla.org/preferences-service;1"];
var prefs = PrefService.getService(Ci.nsIPrefBranch);
var prefService = PrefService.getService(Ci.nsIPrefService);

var reDBG = /extensions\.([^\.]*)\.(DBG_.*)/;

// ********************************************************************************************* //
// TraceOptionsController Implementation

//  getOptionsMenuItems to create View, onPrefChangeHandler for View update
//  base for trace viewers like tracePanel and traceConsole
//  binds  to the branch 'prefDomain' of prefs
var TraceOptionsController = function(prefDomain, onPrefChangeHandler)
{
    this.prefDomain = prefDomain;

    var scope = {};
    Cu["import"]("resource://fbtrace/firebug-trace-service.js", scope);
    this.traceService = scope.traceConsoleService;

    this.addObserver = function()
    {
        prefs.setBoolPref("browser.dom.window.dump.enabled", true);
        this.observer = { observe: Obj.bind(this.observe, this) };
        prefs.addObserver(prefDomain, this.observer, false);
    };

    this.removeObserver = function()
    {
        prefs.removeObserver( prefDomain, this.observer, false);
    };

    // nsIObserver
    this.observe = function(subject, topic, data)
    {
        if (topic == "nsPref:changed")
        {
            var m = reDBG.exec(data);
            if (m)
            {
                var changedPrefDomain = "extensions." + m[1];
                if (changedPrefDomain == prefDomain)
                {
                    var optionName = data.substr(prefDomain.length+1); // skip dot
                    var optionValue = Options.get(m[2]);
                    if (this.prefEventToUserEvent)
                        this.prefEventToUserEvent(optionName, optionValue);
                }
            }
            else
            {
                if (typeof(FBTrace) != "undefined" && FBTrace.DBG_OPTIONS)
                    FBTrace.sysout("traceModule.observe : "+data+"\n");
            }
        }
    };

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI

    this.getOptionsMenuItems = function()  // Firebug menu items from option map
    {
        var optionMap = this.traceService.getTracer(prefDomain);
        var items = [];
        for (var p in optionMap)
        {
            var m = p.indexOf("DBG_");
            if (m != 0)
                continue;

            try
            {
                var prefValue = Options.get(p);
                var label = p.substr(4);
                items.push({
                    label: label,
                    nol10n: true,
                    type: "checkbox",
                    checked: prefValue,
                    pref: p,
                    command: Obj.bind(this.userEventToPrefEvent, this)
                });
            }
            catch (err)
            {
                if (FBTrace.DBG_ERRORS)
                {
                    FBTrace.sysout("traceModule.getOptionsMenuItems could not create item for " +
                        p + " in prefDomain " + this.prefDomain + ", " + err, err);
                }
                // if the option doesn't exist in this prefDomain, just continue...
            }
        }

        items.sort(function(a, b)
        {
            return a.label > b.label;
        });

        return items;
    };

    // use as an event listener on UI control
    this.userEventToPrefEvent = function(event)
    {
        var menuitem = event.target.wrappedJSObject;
        if (!menuitem)
            menuitem = event.target;

        var label = menuitem.getAttribute("label");
        var category = "DBG_" + label;
        var value = Options.get(category);
        var newValue = !value;

        Options.set(category, newValue);
        prefService.savePrefFile(null);

        if (FBTrace.DBG_OPTIONS)
        {
            FBTrace.sysout("traceConsole.setOption: new value "+ this.prefDomain+"."+
                category+ " = " + newValue, menuitem);
        }
    };

    if (onPrefChangeHandler)
    {
        this.prefEventToUserEvent = onPrefChangeHandler;
    }
    else
    {
        this.prefEventToUserEvent = function(optionName, optionValue)
        {
            FBTrace.sysout("TraceOptionsController owner needs to implement prefEventToUser Event",
                {name: optionName, value: optionValue});
        };
    }

    this.clearOptions = function()
    {
        var optionMap = this.traceService.getTracer(prefDomain);
        var items = [];
        for (var p in optionMap)
        {
            var m = p.indexOf("DBG_");
            if (m != 0)
                continue;

            Options.set(p, false);
        }
        prefService.savePrefFile(null);
    };
};

// ********************************************************************************************* //
// Registration

return TraceOptionsController;

// ********************************************************************************************* //
});
