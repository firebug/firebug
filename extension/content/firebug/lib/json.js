/* See license.txt for terms of usage */

define([
    "firebug/lib/trace"
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

var Json = {};

// ********************************************************************************************* //
// JSON

Json.parseJSONString = function(jsonString, originURL)
{
    if (FBTrace.DBG_JSONVIEWER)
        FBTrace.sysout("jsonviewer.parseJSON; " + jsonString);

    // See if this is a Prototype style *-secure request.
    var regex = new RegExp(/\s*\/\*-secure-([\s\S]*)\*\/\s*$/);
    var matches = regex.exec(jsonString);

    if (matches)
    {
        jsonString = matches[1];

        if (jsonString[0] == "\\" && jsonString[1] == "n")
            jsonString = jsonString.substr(2);

        if (jsonString[jsonString.length-2] == "\\" && jsonString[jsonString.length-1] == "n")
            jsonString = jsonString.substr(0, jsonString.length-2);
    }

    if (jsonString.indexOf("&&&START&&&"))
    {
        regex = new RegExp(/&&&START&&& (.+) &&&END&&&/);
        matches = regex.exec(jsonString);
        if (matches)
            jsonString = matches[1];
    }

    try
    {
        var s = Components.utils.Sandbox(originURL);

        // throw on the extra parentheses
        return Components.utils.evalInSandbox("(" + jsonString + ")", s);
    }
    catch(e)
    {
        if (FBTrace.DBG_JSONVIEWER)
            FBTrace.sysout("jsonviewer.parseJSON FAILS on "+originURL+" for \""+jsonString+
                "\" with EXCEPTION "+e, e);
    }

    // Let's try to parse it as JSONP.
    var reJSONP = /^\s*([A-Za-z0-9_.]+\s*(?:\[.*\]|))\s*\(.*\)/;
    var m = reJSONP.exec(jsonString);
    if (!m || !m[1])
        return null;

    if (FBTrace.DBG_JSONVIEWER)
        FBTrace.sysout("jsonviewer.parseJSONP; " + jsonString);

    var callbackName = m[1];

    if (FBTrace.DBG_JSONVIEWER)
        FBTrace.sysout("jsonviewer.parseJSONP; Look like we have a JSONP callback: " + callbackName);

    // Replace the original callback (it can be e.g. foo.bar[1]) with simple function name.
    jsonString = jsonString.replace(callbackName, "callback");

    try
    {
        var s = Components.utils.Sandbox(originURL);
        s["callback"] = function(object) { return object; };
        return Components.utils.evalInSandbox(jsonString, s);
    }
    catch(ex)
    {
        if (FBTrace.DBG_JSONVIEWER)
            FBTrace.sysout("jsonviewer.parseJSON EXCEPTION", e);
    }

    return null;
};

Json.parseJSONPString = function(jsonString, originURL)
{
};

// ********************************************************************************************* //

return Json;

// ********************************************************************************************* //
});
