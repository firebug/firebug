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

Firebug.JSONViewerModel = FBL.extend(Firebug.Module,
{
    dispatchName: "jsonViewer",

    initialize: function()
    {
        Firebug.NetMonitor.NetInfoBody.addListener(this);
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
        FBL.dispatch(this.fbListeners, "onParseJSON", [file]);

        // The JSON is still no there, try to parse most common cases.
        if (!file.jsonObject)
        {
            if (this.isJSON(FBL.safeGetContentType(file.request), file.responseText))
                file.jsonObject = this.parseJSON(file);
        }

        // The jsonObject is created so, the JSON tab can be displayed.
        if (file.jsonObject && FBL.hasProperties(file.jsonObject))
        {
            Firebug.NetMonitor.NetInfoBody.appendTab(infoBox, "JSON",
                FBL.$STR("jsonviewer.tab.JSON"));

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
        var responseText = data ? FBL.trimLeft(data) : null;
        if (responseText && responseText.indexOf("{") == 0)
            return true;

        if (!contentType)
            return false;

        contentType = contentType.split(";")[0];
        contentType = FBL.trim(contentType);
        return contentTypes[contentType];
    },

    // Update listener for TabView
    updateTabBody: function(infoBox, file, context)
    {
        var tab = infoBox.selectedTab;
        var tabBody = infoBox.getElementsByClassName("netInfoJSONText").item(0);
        if (!FBL.hasClass(tab, "netInfoJSONTab") || tabBody.updated)
            return;

        tabBody.updated = true;
        tabBody.context = context;

        this.Preview.render(tabBody, file, context);
    },

    parseJSON: function(file)
    {
        var jsonString = new String(file.responseText);
        return FBL.parseJSONString(jsonString, "http://" + file.request.originalURI.host);
    },
});

// ************************************************************************************************

Firebug.JSONViewerModel.Preview = domplate(
{
    bodyTag:
        DIV({"class": "jsonPreview", _repObject: "$file"},
            DIV({"class": "title"},
                DIV({"class": "sortLink", onclick: "$onSort", $sorted: "$sorted"},
                    SPAN({"class": "doSort"}, FBL.$STR("jsonviewer.sort")),
                    SPAN({"class": "doNotSort"}, FBL.$STR("jsonviewer.do not sort"))
                )
            ),
            DIV({"class": "jsonPreviewBody"})
        ),

    onSort: function(event)
    {
        var target = event.target;
        var sortLink = FBL.getAncestorByClass(target, "sortLink");
        if (!sortLink)
            return;

        FBL.cancelEvent(event);

        FBL.toggleClass(sortLink, "sorted");
        Firebug.Options.set("sortJsonPreview", !Firebug.sortJsonPreview);

        var preview = FBL.getAncestorByClass(sortLink, "jsonPreview");
        var body = FBL.getAncestorByClass(sortLink, "netInfoJSONText");
        this.render(body, preview.repObject, body.context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    render: function(body, file, context)
    {
        if (!file.jsonObject)
            return;

        if (!body.jsonTree)
            body.jsonTree = new JSONTreePlate();

        var input = {file: file, sorted: Firebug.sortJsonPreview};
        parentNode = this.bodyTag.replace(input, body, this);
        parentNode = parentNode.getElementsByClassName("jsonPreviewBody").item(0);

        body.jsonTree.render(file.jsonObject, parentNode, context);
    }
});

// ************************************************************************************************

function JSONTreePlate()
{
    // Used by Firebug.DOMPanel.DirTable domplate.
    this.toggles = new FBL.ToggleBranch();
}

// xxxHonza: this object is *not* a panel (using Firebug terminology), but
// there is no other way how to subclass the DOM Tree than to derive from the DOMBasePanel.
// Better solution would be to have a middle object between DirTablePlate and DOMBasePanel.
JSONTreePlate.prototype = FBL.extend(Firebug.DOMBasePanel.prototype,
{
    dispatchName: "JSONTreePlate",

    render: function(jsonObject, parentNode, context)
    {
        try
        {
            this.panelNode = parentNode;
            this.context = context;

            var members = this.getMembers(jsonObject, 0);
            this.expandMembers(members, this.toggles, 0, 0, context);
            this.showMembers(members, false, false);
        }
        catch (err)
        {
            if (FBTrace.DBG_JSONVIEWER)
                FBTrace.sysout("jsonviewer.render; EXCEPTION", err);
        }
    },

    getMembers: function(object, level, context)
    {
        if (!level)
            level = 0;

        var members = [];

        for (var name in object)
        {
            var val = object[name];
            this.addMember(object, "user", members, name, val, level, 0);
        }

        function sortName(a, b) { return a.name > b.name ? 1 : -1; }
        if (Firebug.sortJsonPreview)
            members.sort(sortName);

        return members;
    }
});

// ************************************************************************************************
// Registration

Firebug.registerModule(Firebug.JSONViewerModel);

return Firebug.JSONViewerModel;

// ************************************************************************************************
}});
