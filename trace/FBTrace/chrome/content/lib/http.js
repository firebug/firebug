/* See license.txt for terms of usage */

define([
    "fbtrace/trace",
    "fbtrace/lib/string",
],
function(FBTrace, Str) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

var Http = {};

// ********************************************************************************************* //
// Module Implementation

Http.readFromStream = function(stream, charset, noClose)
{
    // Causes a memory leak (see https://bugzilla.mozilla.org/show_bug.cgi?id=699801)
    //var sis = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
    //sis.setInputStream(stream);

    var sis = Cc["@mozilla.org/scriptableinputstream;1"].
        createInstance(Ci.nsIScriptableInputStream);
    sis.init(stream);

    var segments = [];
    for (var count = stream.available(); count; count = stream.available())
        segments.push(sis.readBytes(count));

    if (!noClose)
        sis.close();

    var text = segments.join("");

    try
    {
        return Str.convertToUnicode(text, charset);
    }
    catch (err)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("http.readFromStream EXCEPTION charset: " + charset, err);
    }

    return text;
};

// ********************************************************************************************* //
// Registration

return Http;

// ********************************************************************************************* //
});
