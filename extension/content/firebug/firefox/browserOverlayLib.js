/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/locale",
],
function(FBTrace, Locale) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

// ********************************************************************************************* //
// Overlay Helpers

var BrowserOverlayLib =
{
    $: function(doc, id)
    {
        return doc.getElementById(id);
    },

    $$: function(doc, selector)
    {
        return doc.querySelectorAll(selector);
    },

    $el: function(doc, name, attributes, children, parent)
    {
        if (!(doc instanceof Ci.nsIDOMDocument))
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("browserOvelayLib.$el; No document!");
            return;
        }

        attributes = attributes || {};

        if (!Array.isArray(children) && !parent)
        {
            parent = children;
            children = null;
        }

        // localize
        if (attributes.label)
            attributes.label = Locale.$STR(attributes.label);

        if (attributes.title)
            attributes.title = Locale.$STR(attributes.title);

        if (attributes.tooltiptext)
            attributes.tooltiptext = Locale.$STR(attributes.tooltiptext);

        // persist
        if (attributes.persist)
            updatePersistedValues(doc, attributes);

        var el = doc.createElement(name);
        for (var a in attributes)
            el.setAttribute(a, attributes[a]);

        for (var i=0; children && i<children.length; i++)
            el.appendChild(children[i]);

        if (parent)
        {
            if (attributes.position)
                parent.insertBefore(el, parent.children[attributes.position - 1]);
            else
                parent.appendChild(el);

            // Mark to remove when Firebug is uninstalled.
            el.setAttribute("firebugRootNode", true);
        }

        return el;
    },

    $command: function(doc, id, oncommand, arg)
    {
        // Wrap the command within a startFirebug call. If Firebug isn't yet loaded
        // this will force it to load.
        oncommand = "Firebug.browserOverlay.startFirebug(function(){" + oncommand + "})";
        if (arg)
            oncommand = "void function(arg){" + oncommand + "}(" + arg + ")";

        return this.$el(doc, "command", {
            id: id,
            oncommand: oncommand
        }, this.$(doc, "mainCommandSet"));
    },

    $key: function(doc, id, key, modifiers, command, position)
    {
        var attributes = {
            id: id,
            modifiers: modifiers,
            command: command,
            position: position
        };

        attributes[KeyEvent["DOM_" + key] ? "keycode" : "key"] = key;

        return this.$el(doc, "key", attributes, $(doc, "mainKeyset"));
    },

    $menupopup: function(doc, attributes, children, parent)
    {
        return this.$el(doc, "menupopup", attributes, children, parent);
    },

    $menu: function(doc, attrs, children)
    {
        return this.$el(doc, "menu", attrs, children);
    },

    $menuseparator: function(doc, attrs)
    {
        return this.$el(doc, "menuseparator", attrs);
    },

    $menuitem: function(doc, attrs)
    {
        return this.$el(doc, "menuitem", attrs);
    },

    $menupopupOverlay: function(doc, parent, children, attributes)
    {
        if (!parent)
            return;

        attributes = attributes || {};
        for (var a in attributes)
            parent.setAttribute(a, attributes[a]);

        for (var i=0; i<children.length; ++i)
        {
            var child = children[i];
            var beforeEl = null;

            if (child.getAttribute("position"))
            {
                var pos = child.getAttribute("position");
                beforeEl = parent.children[pos - 1];
            }
            else if (child.getAttribute("insertbefore"))
            {
                var ids = child.getAttribute("insertbefore").split(",");
                for (var j=0; j < ids.length; ++j)
                {
                    beforeEl = parent.querySelector("#" + ids[j]);
                    if (beforeEl)
                        break;
                }
            }
            else if (child.getAttribute("insertafter"))
            {
                var ids = child.getAttribute("insertafter").split(",");
                for (var j=0; j < ids.length; ++j)
                {
                    beforeEl = parent.querySelector("#" + ids[j]);
                    if (beforeEl)
                        break;
                }
                if (beforeEl)
                    beforeEl = beforeEl.nextSibling;
            }

            if (beforeEl)
                parent.insertBefore(child, beforeEl);
            else
                parent.appendChild(child);

            // Mark the inserted node to remove it when Firebug is uninstalled.
            child.setAttribute("firebugRootNode", true);
        }
    },

    $toolbarButton: function(doc, id, attrs, children, defaultPos)
    {
        attrs["class"] = "toolbarbutton-1";
        attrs.id = id;

        // in seamonkey gNavToolbox is null onload
        this.$el(doc, "toolbarbutton", attrs, children,
            (doc.defaultView.gNavToolbox || this.$(doc, "navigator-toolbox")).palette);

        var selector = "[currentset^='" + id + ",'],[currentset*='," + id +
            ",'],[currentset$='," + id + "']";

        var toolbar = doc.querySelector(selector);
        if (!toolbar)
            return; // todo defaultPos

        var currentset = toolbar.getAttribute("currentset").split(",");
        var i = currentset.indexOf(id) + 1;

        var len = currentset.length;
        var beforeEl = null;
        while (i < len && !(beforeEl = this.$(doc, currentset[i])))
            i++;

        return toolbar.insertItem(id, beforeEl);
    },

    $toolbarItem: function(doc, id, attrs, children, defaultPos)
    {
        attrs.id = id;

        // in seamonkey gNavToolbox is null onload
        this.$el(doc, "toolbaritem", attrs, children,
            (doc.defaultView.gNavToolbox || this.$(doc, "navigator-toolbox")).palette);

        var selector = "[currentset^='" + id + ",'],[currentset*='," + id +
        ",'],[currentset$='," + id + "']";

        var toolbar = doc.querySelector(selector);
        if (!toolbar)
            return; // todo defaultPos

        var currentset = toolbar.getAttribute("currentset").split(",");
        var i = currentset.indexOf(id) + 1;

        var len = currentset.length;
        var beforeEl = null;
        while (i < len && !(beforeEl = this.$(doc, currentset[i])))
            i++;

        return toolbar.insertItem(id, beforeEl);
    },

    $tooltip: function(doc, attrs, children)
    {
        return this.$el(doc, "tooltip", attrs, children);
    },

    $label: function(doc, attrs)
    {
        return this.$el(doc, "label", attrs);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Stylesheets & Scripts

    $stylesheet: function(doc, href)
    {
        var s = doc.createProcessingInstruction("xml-stylesheet", 'href="' + href + '"');
        doc.insertBefore(s, doc.documentElement);
        return s;
    },

    $script: function(doc, src)
    {
        var script = doc.createElementNS("http://www.w3.org/1999/xhtml", "html:script");
        script.src = src;
        script.type = "text/javascript";
        script.setAttribute("firebugRootNode", true);
        doc.documentElement.appendChild(script);
    }
};

// ********************************************************************************************* //
// Helpers

function updatePersistedValues(doc, options)
{
    var persist = options.persist.split(",");
    var id = options.id;
    var RDF = Cc["@mozilla.org/rdf/rdf-service;1"].getService(Ci.nsIRDFService);
    var store = doc.defaultView.PlacesUIUtils.localStore; //this.RDF.GetDataSource("rdf:local-store");
    var root = RDF.GetResource("chrome://browser/content/browser.xul#" + id);

    var getPersist = function getPersist(aProperty)
    {
        var property = RDF.GetResource(aProperty);
        var target = store.GetTarget(root, property, true);

        if (target instanceof Ci.nsIRDFLiteral)
            return target.Value;
    };

    for (var i=0; i<persist.length; i++)
    {
        var attr = persist[i];
        var val = getPersist(attr);
        if (val)
            options[attr] = val;
    }
}

// ********************************************************************************************* //
// Registration

// Bind every method to BrowserOverlayLib.

for (var method in BrowserOverlayLib)
{
    if (BrowserOverlayLib.hasOwnProperty(method))
        BrowserOverlayLib[method] = BrowserOverlayLib[method].bind(BrowserOverlayLib);
}

return BrowserOverlayLib;

// ********************************************************************************************* //
});
