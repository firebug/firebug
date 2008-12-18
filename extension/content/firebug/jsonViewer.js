/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Model implementation

Firebug.JSONViewerModel = extend(Firebug.Module,
{
    initialize: function() 
    {
        Firebug.NetMonitor.NetInfoBody.addListener(this);

        // Used by Firebug.DOMPanel.DirTable domplate.
        this.toggles = {};
    },

    shutdown: function() 
    {
        Firebug.NetMonitor.NetInfoBody.removeListener(this);
    },

    initTabBody: function(infoBox, file)
    {
        if (FBTrace.DBG_JSONVIEWER)
            FBTrace.sysout("jsonviewer.JSONViewerModel.initTabBody", infoBox);

        const maybeHarmful = /[^,:{}\[\]0-9.\-+Eaeflnr-u \n\r\t]/;
        const jsonStrings = /"(\\.|[^"\\\n\r])*"/g;
        var jsonString = new String(file.responseText);

        // xxxadatta02: not every JSON response is going to have this header...
        // need some way to override this
        var contentType = new String(file.request.contentType).toLowerCase();
        if ((contentType != "application/json" &&
            contentType != "text/plain" &&
            contentType != "text/x-json" &&
            contentType != "text/javascript"))
            return;

        // Check the file.request content-type and display
        // the tab only when appropriate.
        Firebug.NetMonitor.NetInfoBody.appendTab(infoBox, "JSON",
            $STR("jsonviewer.tab.JSON"));
    },

    // Update listener for TabView
    updateTabBody: function(infoBox, file, context)
    {
        var tab = infoBox.selectedTab;
        var tabBody = getElementByClass(infoBox, "netInfoJSONText");
        if (hasClass(tab, "netInfoJSONTab") || tabBody.updated)
            return;

        tabBody.updated = true;

        var jsonString = new String(file.responseText);
        var e = null;

        // see if this is a Prototype style *-secure request
        var regex = new RegExp(/^\/\*-secure-([\s\S]*)\*\/\s*$/);
        var matches = regex.exec(jsonString);

        if ( matches ) {
            jsonString = matches[1];

            if(jsonString[0] == "\\" && jsonString[1] == "n")
                jsonString = jsonString.substr(2);

            if(jsonString[jsonString.length-2] == "\\" && jsonString[jsonString.length-1] == "n")
                jsonString = jsonString.substr(0, jsonString.length-2);
        }

        if(jsonString.indexOf("&&&START&&&")){
            regex = new RegExp(/&&&START&&& (.+) &&&END&&&/);
            matches = regex.exec(jsonString);
            if(matches){
                jsonString = matches[1];
            }
        }

        // throw on the extra parentheses
        jsonString = "(" + jsonString + ")";

        var s = Components.utils.Sandbox("http://" + file.request.originalURI.host);
        var jsonObject = null;

        try
        {
            jsonObject = Components.utils.evalInSandbox(jsonString, s);
        }
        catch(e)
        {
            if (e.message.indexOf("is not defined"))
            {
                var parts = e.message.split(" ");

                s[parts[0]] = function(str){ return str; };

                try {
                    jsonObject = Components.utils.evalInSandbox(jsonString, s);
                } catch(ex) {
                    if (FBTrace.DBG_ERROR || FBTrace.DBG_JSONVIEWER)
                        FBTrace.sysout("jsonviewer.updateTabBody EXCEPTION", e);
                }

            }
            else
            {
                // xxxadatta02: maybe remove the tab if parsing failed?
                if (FBTrace.DBG_ERROR || FBTrace.DBG_JSONVIEWER)
                    FBTrace.sysout("jsonviewer.updateTabBody EXCEPTION", e);
                return;
            }
        }

        if(jsonObject) {
            Firebug.DOMPanel.DirTable.tag.replace(
                 {object: jsonObject, toggles: this.toggles}, tabBody);
        }
    }
}); 

// ************************************************************************************************
// Registration

Firebug.registerModule(Firebug.JSONViewerModel);
}});
