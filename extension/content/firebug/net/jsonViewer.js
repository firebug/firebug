/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/http",
    "firebug/lib/string",
    "firebug/lib/json",
    "firebug/dom/toggleBranch",
    "firebug/lib/array",
    "firebug/lib/system",
    "firebug/dom/domPanel",
    "firebug/chrome/reps"
],
function(Obj, Firebug, Domplate, Locale, Events, Css, Dom, Http, Str, Json,
    ToggleBranch, Arr, System) {

"use strict";

// ********************************************************************************************* //
// Constants

var {domplate, SPAN, DIV} = Domplate;

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

// ********************************************************************************************* //
// Model implementation

Firebug.JSONViewerModel = Obj.extend(Firebug.Module,
{
    dispatchName: "jsonViewer",
    contentTypes: contentTypes,

    initialize: function()
    {
        Firebug.NetMonitor.NetInfoBody.addListener(this);
        Firebug.registerUIListener(this);
    },

    shutdown: function()
    {
        Firebug.NetMonitor.NetInfoBody.removeListener(this);
        Firebug.unregisterUIListener(this);
    },

    onContextMenu: function(items, object, target, context, panel, popup)
    {
        if (panel.name != "net" && panel.name != "console")
            return;

        var memberLabel = Dom.getAncestorByClass(target, "memberLabel");

        if (!memberLabel)
            return;

        var row = Dom.getAncestorByClass(target, "memberRow");
        if (!row || !row.domObject.value)
            return;

        items.push({
           id: "fbNetCopyJSON",
           nol10n: true,
           label: Locale.$STRF("net.jsonviewer.Copy_JSON", [row.domObject.name]),
           command: Obj.bindFixed(this.copyJsonResponse, this, row)
        });
    },

    copyJsonResponse:function(row)
    {
        var value = JSON.stringify(row.domObject.value);
        if (value)
            System.copyToClipboard(value);
    },

    initTabBody: function(infoBox, file)
    {
        if (FBTrace.DBG_JSONVIEWER)
            FBTrace.sysout("jsonviewer.initTabBody", {infoBox: infoBox, file: file});

        // Let listeners to parse the JSON.
        Events.dispatch(this.fbListeners, "onParseJSON", [file]);

        // The JSON is still no there, try to parse most common cases.
        if (!file.jsonObject)
        {
            if (this.isJSON(Http.safeGetContentType(file.request), file.responseText))
                file.jsonObject = this.parseJSON(file);
        }

        // The jsonObject is created so, the JSON tab can be displayed.
        if (file.jsonObject)
        {
            Firebug.NetMonitor.NetInfoBody.appendTab(infoBox, "JSON",
                Locale.$STR("jsonviewer.tab.JSON"));

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
        // Do a manual string search instead of checking (data.strip()[0] === "{")
        // to improve performance/memory usage.
        var len = data ? data.length : 0;
        for (var i = 0; i < len; i++)
        {
            var ch = data.charAt(i);
            if (ch === "{")
                return true;
            if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r")
                continue;
            break;
        }

        if (!contentType)
            return false;

        contentType = contentType.split(";")[0];
        contentType = Str.trim(contentType);
        return contentTypes[contentType];
    },

    // Update listener for TabView
    updateTabBody: function(infoBox, file, context)
    {
        var tab = infoBox.selectedTab;
        var tabBody = infoBox.getElementsByClassName("netInfoJSONText").item(0);
        if (!Css.hasClass(tab, "netInfoJSONTab") || tabBody.updated)
            return;

        if (FBTrace.DBG_JSONVIEWER)
            FBTrace.sysout("jsonviewer.updateTabBody", infoBox);

        tabBody.updated = true;
        tabBody.context = context;

        this.Preview.render(tabBody, file, context);
    },

    parseJSON: function(file)
    {
        var jsonString = new String(file.responseText);
        return Json.parseJSONString(jsonString, "http://" + file.request.originalURI.host);
    },
});

// ********************************************************************************************* //

Firebug.JSONViewerModel.Preview = domplate(
{
    bodyTag:
        DIV({"class": "jsonPreview", _repObject: "$file"},
            DIV({"class": "title"},
                DIV({"class": "sortLink", onclick: "$onSort", $sorted: "$sorted"},
                    SPAN({"class": "doSort"}, Locale.$STR("jsonviewer.sort")),
                    SPAN({"class": "doNotSort"}, Locale.$STR("jsonviewer.do not sort"))
                )
            ),
            DIV({"class": "jsonPreviewBody"})
        ),

    onSort: function(event)
    {
        var target = event.target;
        var sortLink = Dom.getAncestorByClass(target, "sortLink");
        if (!sortLink)
            return;

        Events.cancelEvent(event);

        Css.toggleClass(sortLink, "sorted");
        Firebug.Options.set("sortJsonPreview", !Firebug.sortJsonPreview);

        var preview = Dom.getAncestorByClass(sortLink, "jsonPreview");
        var body = Dom.getAncestorByClass(sortLink, "netInfoJSONText");
        if (!body)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("jsonViewer.onSort; ERROR body is null");
            return;
        }

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
        var parentNode = this.bodyTag.replace(input, body, this);
        parentNode = parentNode.getElementsByClassName("jsonPreviewBody").item(0);

        body.jsonTree.render(file.jsonObject, parentNode, context);
    }
});

// ********************************************************************************************* //

function JSONTreePlate()
{
    // Used by Firebug.DOMPanel.DirTable domplate.
    this.toggles = new ToggleBranch.ToggleBranch();
}

// xxxHonza: this object is *not* a panel (using Firebug terminology), but
// there is no other way how to subclass the DOM Tree than to derive from the DOMBasePanel.
// Better solution would be to have a middle object between DirTablePlate and DOMBasePanel.
JSONTreePlate.prototype = Obj.extend(Firebug.DOMBasePanel.prototype,
{
    dispatchName: "JSONTreePlate",

    render: function(jsonObject, parentNode, context)
    {
        try
        {
            this.panelNode = parentNode;
            this.context = context;

            var members = this.getMembers(jsonObject, 0);
            this.expandMembers(members, this.toggles, 0, 0);
            this.showMembers(members, false, false);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_JSONVIEWER)
                FBTrace.sysout("jsonviewer.render; EXCEPTION", err);
        }
    },

    getMembers: function(object, level)
    {
        if (!level)
            level = 0;

        var members = [];

        for (var name in object)
        {
            var val = object[name];
            this.addMember(object, "user", members, name, val, level);
        }

        function sortName(a, b) { return a.name > b.name ? 1 : -1; }

        // Sort only if it isn't an array (issue 4382).
        if (Firebug.sortJsonPreview && !Arr.isArray(object, this.context.window))
            members.sort(sortName);

        return members;
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.JSONViewerModel);

return Firebug.JSONViewerModel;

// ********************************************************************************************* //
});
