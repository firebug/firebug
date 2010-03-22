/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************

// List of JSON content types.
var contentTypes =
{
    "text/plain": 1,
    "text/javascript": 1,
    "text/x-javascript": 1,
    "text/json": 1,
    "text/x-json": 1,
    "application/json": 1,
    "application/x-json": 1,
    "application/javascript": 1,
    "application/x-javascript": 1,
    "application/json-rpc": 1
};

// ************************************************************************************************
// Model implementation

Firebug.JSONViewerModel = extend(Firebug.Module,
{
    dispatchName: "jsonViewer",
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
            FBTrace.sysout("jsonviewer.initTabBody", infoBox);

        // Let listeners to parse the JSON.
        dispatch(this.fbListeners, "onParseJSON", [file]);

        // The JSON is still no there, try to parse most common cases.
        if (!file.jsonObject)
        {
            if (this.isJSON(safeGetContentType(file.request), file.responseText))
                file.jsonObject = this.parseJSON(file);
        }

        // The jsonObject is created so, the JSON tab can be displayed.
        if (file.jsonObject && hasProperties(file.jsonObject))
        {
            Firebug.NetMonitor.NetInfoBody.appendTab(infoBox, "JSON",
                $STR("jsonviewer.tab.JSON"));

            if (FBTrace.DBG_JSONVIEWER)
                FBTrace.sysout("jsonviewer.initTabBody; JSON object available " +
                    (typeof(file.jsonObject) != "undefined"), file.jsonObject);
        }
    },

    isJSON: function(contentType, data)
    {
        // Workaround for JSON responses without proper content type
        // Let's consider all responses starting with "{" as JSON. In the worst
        // case there will be an exception when parsing. This means that no-JSON
        // responses (and post data) (with "{") can be parsed unnecessarily,
        // which represents a little overhead, but this happens only if the request
        // is actually expanded by the user in the UI (Net & Console panels).
        var responseText = data ? trimLeft(data) : null;
        if (responseText && responseText.indexOf("{") == 0)
            return true;

        if (!contentType)
            return false;

        contentType = contentType.split(";")[0];
        contentType = trim(contentType);
        return contentTypes[contentType];
    },

    // Update listener for TabView
    updateTabBody: function(infoBox, file, context)
    {
        var tab = infoBox.selectedTab;
        var tabBody = infoBox.getElementsByClassName("netInfoJSONText").item(0);
        if (!hasClass(tab, "netInfoJSONTab") || tabBody.updated)
            return;

        tabBody.updated = true;

        if (file.jsonObject) {
            Firebug.DOMPanel.DirTable.tag.replace(
                 {object: file.jsonObject, toggles: this.toggles}, tabBody);
        }
    },

    parseJSON: function(file)
    {
        var jsonString = new String(file.responseText);
        return parseJSONString(jsonString, "http://" + file.request.originalURI.host);
    },
});

// ************************************************************************************************
// Registration

Firebug.registerModule(Firebug.JSONViewerModel);

// ************************************************************************************************
}});
