/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************

// List of JSON content types.
var contentTypes =
{
    "application/json": 1,
    "text/plain": 1,
    "text/x-json": 1,
    "text/json": 1,
    "text/javascript": 1
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
            if (this.isJSON(safeGetContentType(file.request)))
                file.jsonObject = this.parseJSON(file);
        }

        // The jsonObject is created so, the JSON tab can be displayed.
        if (file.jsonObject)
        {
            Firebug.NetMonitor.NetInfoBody.appendTab(infoBox, "JSON",
                $STR("jsonviewer.tab.JSON"));

            if (FBTrace.DBG_JSONVIEWER)
                FBTrace.sysout("jsonviewer.initTabBody; JSON object available", file.jsonObject);
        }
    },

    isJSON: function(contentType)
    {
        if (!contentType)
            return false;

        contentType = contentType.split(";")[0];
        return contentTypes[contentType];
    },

    // Update listener for TabView
    updateTabBody: function(infoBox, file, context)
    {
        var tab = infoBox.selectedTab;
        var tabBody = getElementByClass(infoBox, "netInfoJSONText");
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
