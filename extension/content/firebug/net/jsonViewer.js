/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/http",
    "firebug/lib/string",
    "firebug/lib/json",
    "firebug/lib/options",
    "firebug/lib/array",
    "firebug/lib/system",
    "firebug/chrome/module",
    "firebug/dom/domBaseTree",
    "firebug/dom/domMemberProvider",
],
function(Firebug, FBTrace, Obj, Domplate, Locale, Events, Css, Dom, Http, Str, Json, Options,
    Arr, System, Module, DomBaseTree, DOMMemberProvider) {

"use strict";

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_JSONVIEWER");

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

var JSONViewerModel = Obj.extend(Module,
{
    dispatchName: "jsonViewer",
    contentTypes: contentTypes,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context Menu

    onContextMenu: function(items, object, target, context, panel, popup)
    {
        if (!panel || (panel.name != "net" && panel.name != "console"))
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    initTabBody: function(infoBox, file)
    {
        Trace.sysout("jsonviewer.initTabBody", {infoBox: infoBox, file: file});

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

            Trace.sysout("jsonviewer.initTabBody; JSON object available " +
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Update listener for TabView

    updateTabBody: function(infoBox, file, context)
    {
        var tab = infoBox.selectedTab;
        var tabBody = infoBox.getElementsByClassName("netInfoJSONText").item(0);
        if (!Css.hasClass(tab, "netInfoJSONTab") || tabBody.updated)
            return;

        Trace.sysout("jsonviewer.updateTabBody", infoBox);

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

JSONViewerModel.Preview = domplate(
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
        Options.set("sortJsonPreview", !Options.get("sortJsonPreview"));

        var preview = Dom.getAncestorByClass(sortLink, "jsonPreview");
        var body = Dom.getAncestorByClass(sortLink, "netInfoJSONText");
        if (!body)
        {
            TraceError.sysout("jsonViewer.onSort; ERROR body is null");
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
            body.jsonTree = new DomBaseTree(context);

        var input = {file: file, sorted: Options.get("sortJsonPreview")};
        var parentNode = this.bodyTag.replace(input, body, this);
        parentNode = parentNode.getElementsByClassName("jsonPreviewBody").item(0);

        body.jsonTree.memberProvider = new JSONProvider(context);
        body.jsonTree.replace(parentNode, {object: file.jsonObject});
    }
});

// ********************************************************************************************* //
// JSON Tree Provider

function JSONProvider(context)
{
    this.context = context;
}

JSONProvider.prototype = Obj.extend(new DOMMemberProvider(),
{
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
        if (Options.get("sortJsonPreview") && !Array.isArray(object, this.context.window))
            members.sort(sortName);

        return members;
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(JSONViewerModel);

// xxxHonza: backward compatibility, used by AmosFrameworkForFirebug extension:
// https://addons.mozilla.org/en-us/firefox/addon/amosframeworkforfirebug/
Firebug.JSONViewerModel = JSONViewerModel;

return JSONViewerModel;

// ********************************************************************************************* //
});
