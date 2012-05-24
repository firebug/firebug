/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/xpcom",
    "firebug/lib/css",
    "firebug/lib/http",
    "httpmonitor/net/netUtils",
],
function(Obj, Firebug, Domplate, Locale, Xpcom, Css, Http, NetUtils) {

with (Domplate) {

// ************************************************************************************************
// Constants

// List of SVG related content types.
var contentTypes =
[
    "image/svg+xml",
];

// ************************************************************************************************
// Model implementation

/**
 * @module Implements viewer for SVG based network responses. In order to create a new
 * tab wihin network request detail, a listener is registered into
 * <code>Firebug.NetMonitor.NetInfoBody</code> object.
 */
Firebug.SVGViewerModel = domplate(Firebug.Module,
/** lends Firebug.SVGViewerModel */
{
    dispatchName: "svgViewer",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Domplate

    table:
        TABLE({"class": "netInfoPostSVGTable", cellpadding: 0, cellspacing: 0,
            "role": "presentation"},
            TBODY({"role": "list", "aria-label": Locale.$STR("svgviewer.tab.SVG")},
                TR({"class": "netInfoPostSVGTitle", "role": "presentation"},
                    TD({"role": "presentation" },
                        DIV({"class": "netInfoPostParams"},
                            Locale.$STR("svgviewer.tab.SVG")
                        )
                    )
                ),
                TR(
                    TD({"class": "netInfoPostSVGBody"})
                )
            )
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Firebug.ActivableModule.initialize.apply(this, arguments);
        Firebug.NetMonitor.NetInfoBody.addListener(this);
    },

    shutdown: function()
    {
        Firebug.ActivableModule.shutdown.apply(this, arguments);
        Firebug.NetMonitor.NetInfoBody.removeListener(this);
    },

    /**
     * Check response's content-type and if it's a SVG, create a new tab with SVG preview.
     */
    initTabBody: function(infoBox, file)
    {
        if (FBTrace.DBG_SVGVIEWER)
            FBTrace.sysout("svgviewer.initTabBody", infoBox);

        // If the response is SVG let's display a pretty preview.
        if (this.isSVG(Http.safeGetContentType(file.request)))
        {
            Firebug.NetMonitor.NetInfoBody.appendTab(infoBox, "SVG",
                Locale.$STR("svgviewer.tab.SVG"));

            if (FBTrace.DBG_SVGVIEWER)
                FBTrace.sysout("svgviewer.initTabBody; SVG response available");
        }
    },

    isSVG: function(contentType)
    {
        if (!contentType)
            return false;

        return NetUtils.matchesContentType(contentType, contentTypes);
    },

    /**
     * Parse SVG response and render pretty printed preview.
     */
    updateTabBody: function(infoBox, file, context)
    {
        var tab = infoBox.selectedTab;
        var tabBody = infoBox.getElementsByClassName("netInfoSVGText").item(0);
        if (!Css.hasClass(tab, "netInfoSVGTab") || tabBody.updated)
            return;

        tabBody.updated = true;

        this.insertSVG(tabBody, file.responseText);
    },

    insertSVG: function(parentNode, text)
    {
        var parser = Xpcom.CCIN("@mozilla.org/xmlextras/domparser;1", "nsIDOMParser");
        var doc = parser.parseFromString(text, "text/xml");
        var root = doc.documentElement;

        // Error handling
        var nsURI = "http://www.mozilla.org/newlayout/xml/parsererror.xml";
        if (root.namespaceURI == nsURI && root.nodeName == "parsererror")
        {
            this.ParseError.tag.replace({error: {
                message: root.firstChild.nodeValue,
                source: root.lastChild.textContent
            }}, parentNode);
            return;
        }

        if (FBTrace.DBG_SVGVIEWER)
            FBTrace.sysout("svgviewer.updateTabBody; SVG response parsed", doc);

        // Override getHidden in these templates. The parsed SVG document is
        // hidden, but we want to display it using 'visible' styling.
        var templates = [
            Firebug.HTMLPanel.CompleteElement,
            Firebug.HTMLPanel.Element,
            Firebug.HTMLPanel.TextElement,
            Firebug.HTMLPanel.EmptyElement,
            Firebug.HTMLPanel.XEmptyElement,
        ];

        var originals = [];
        for (var i=0; i<templates.length; i++)
        {
            originals[i] = templates[i].getHidden;
            templates[i].getHidden = function() {
                return "";
            }
        }

        // Generate SVG preview.
        Firebug.HTMLPanel.CompleteElement.tag.replace({object: doc.documentElement}, parentNode);

        for (var i=0; i<originals.length; i++)
            templates[i].getHidden = originals[i];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Post Body View

    updatePostTabBody: function(parentNode, file, context)
    {
        var contentType = NetUtils.findHeader(file.requestHeaders, "content-type");
        if (!this.isSVG(contentType))
            return;

        var text = NetUtils.getPostText(file, context);
        var svgTable = this.table.append({}, parentNode);
        var svgBody = svgTable.getElementsByClassName("netInfoPostSVGBody").item(0);

        this.insertSVG(svgBody, text);
    }
});

// ************************************************************************************************
// Domplate

/**
 * @domplate Represents a template for displaying SVG parser errors. Used by
 * <code>Firebug.SVGViewerModel</code>.
 */
Firebug.SVGViewerModel.ParseError = domplate(Firebug.Rep,
{
    tag:
        DIV({"class": "svgInfoError"},
            DIV({"class": "svgInfoErrorMsg"}, "$error.message"),
            PRE({"class": "svgInfoErrorSource"}, "$error|getSource")
        ),

    getSource: function(error)
    {
        var parts = error.source.split("\n");
        if (parts.length != 2)
            return error.source;

        var limit = 50;
        var column = parts[1].length;
        if (column >= limit) {
            parts[0] = "..." + parts[0].substr(column - limit);
            parts[1] = "..." + parts[1].substr(column - limit);
        }

        if (parts[0].length > 80)
            parts[0] = parts[0].substr(0, 80) + "...";

        return parts.join("\n");
    }
});

// ************************************************************************************************
// Registration

Firebug.registerModule(Firebug.SVGViewerModel);

return Firebug.SVGViewerModel;

// ************************************************************************************************
}});
