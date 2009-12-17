/* See license.txt for terms of usage */

var FirebugReps = FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const jsdIStackFrame = Ci.jsdIStackFrame;
const jsdIScript = Ci.jsdIScript;

const fbs = Cc["@joehewitt.com/firebug;1"].getService().wrappedJSObject;

// ************************************************************************************************
// Common Tags

var OBJECTBOX = this.OBJECTBOX =
    SPAN({class: "objectBox objectBox-$className", role : "presentation"});

var OBJECTBLOCK = this.OBJECTBLOCK =
    DIV({class: "objectBox objectBox-$className focusRow subLogRow", role : "listitem"});

var OBJECTLINK = this.OBJECTLINK =
    A({
        class: "objectLink objectLink-$className a11yFocus",
        _repObject: "$object"
    });

// ************************************************************************************************

this.Undefined = domplate(Firebug.Rep,
{
    tag: OBJECTBOX("undefined"),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "undefined",

    supportsObject: function(object, type)
    {
        return type == "undefined";
    }
});

// ************************************************************************************************

this.Null = domplate(Firebug.Rep,
{
    tag: OBJECTBOX("null"),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "null",

    supportsObject: function(object, type)
    {
        return object == null;
    }
});

// ************************************************************************************************

this.Nada = domplate(Firebug.Rep,
{
    tag: SPAN(""),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "nada"
});

// ************************************************************************************************

this.Number = domplate(Firebug.Rep,
{
    tag: OBJECTBOX("$object"),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "number",

    supportsObject: function(object, type)
    {
        return type == "boolean" || type == "number";
    }
});

// ************************************************************************************************

this.String = domplate(Firebug.Rep,
{
    tag: OBJECTBOX("&quot;$object&quot;"),

    shortTag: OBJECTBOX("&quot;$object|cropMultipleLines&quot;"),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "string",

    supportsObject: function(object, type)
    {
        return type == "string";
    }
});

// ************************************************************************************************

this.XML = domplate(Firebug.Rep,
{
    tag: OBJECTBOX("$object|asString"),

    shortTag: OBJECTBOX("$object|asShortString"),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "xml",

    supportsObject: function(object, type)
    {
        return type == "xml";
    },

    asString: function(object)
    {
        return object.toXMLString();
    },

    asShortString: function(object)
    {
        return cropMultipleLines(this.asString(object));
    },
});

// ************************************************************************************************

this.Text = domplate(Firebug.Rep,
{
    tag: OBJECTBOX("$object"),

    shortTag: OBJECTBOX("$object|cropMultipleLines"),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "text"
});

// ************************************************************************************************

this.Caption = domplate(Firebug.Rep,
{
    tag: SPAN({class: "caption"}, "$object")
});

// ************************************************************************************************

this.Warning = domplate(Firebug.Rep,
{
    tag: DIV({class: "warning focusRow", role : 'listitem'}, "$object|STR")
});

// ************************************************************************************************

this.Func = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK("$object|summarizeFunction"),

    summarizeFunction: function(fn)
    {
        var fnRegex = /function ([^(]+\([^)]*\)) \{/;
        var fnText = safeToString(fn);

        var m = fnRegex.exec(fnText);
        return m ? m[1] : "function()";
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    copySource: function(fn)
    {
        copyToClipboard(safeToString(fn));
    },

    monitor: function(fn, script, monitored)
    {
        if (monitored)
            Firebug.Debugger.unmonitorScript(fn, script, "monitor");
        else
            Firebug.Debugger.monitorScript(fn, script, "monitor");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "function",

    supportsObject: function(object, type)
    {
        return type == "function";
    },

    inspectObject: function(fn, context)
    {
        var sourceLink = findSourceForFunction(fn, context);
        if (sourceLink)
            Firebug.chrome.select(sourceLink);
        if (FBTrace.DBG_FUNCTION_NAME)
            FBTrace.sysout("reps.function.inspectObject selected sourceLink is ", sourceLink);
    },

    getTooltip: function(fn, context)
    {
        /*  XXjjb I think this is very expensive...
        var script = findScriptForFunctionInContext(context, fn);
        if (script)
            return $STRF("Line", [normalizeURL(script.fileName), script.baseLineNumber]);
        else
         */
            if (fn.toString)
                return fn.toString();
    },

    getTitle: function(fn, context)
    {
        var name = fn.name ? fn.name : "function";
        return name + "()";
    },

    getContextMenuItems: function(fn, target, context, script)
    {
        if (!script)
            script = findScriptForFunctionInContext(context, fn);
        if (!script)
            return;

        var scriptInfo = Firebug.SourceFile.getSourceFileAndLineByScript(context, script);
        var monitored = scriptInfo ? fbs.isMonitored(scriptInfo.sourceFile.href, scriptInfo.lineNo) : false;

        var name = script ? getFunctionName(script, context) : fn.name;
        return [
            {label: "CopySource", command: bindFixed(this.copySource, this, fn) },
            "-",
            {label: $STRF("ShowCallsInConsole", [name]), nol10n: true,
             type: "checkbox", checked: monitored,
             command: bindFixed(this.monitor, this, fn, script, monitored) }
        ];
    }
});

// ************************************************************************************************

this.jsdScript = domplate(Firebug.Rep,
{
    copySource: function(script)
    {
        var fn = unwrapIValue(script.functionObject);
        return FirebugReps.Func.copySource(fn);
    },

    monitor: function(fn, script, monitored)
    {
        fn = unwrapIValue(script.functionObject);
        return FirebugReps.Func.monitor(fn, script, monitored);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "jsdScript",
    inspectable: false,

    supportsObject: function(object, type)
    {
        return object instanceof jsdIScript;
    },

    inspectObject: function(script, context)
    {
        var sourceLink = getSourceLinkForScript(script, context);
        if (sourceLink)
            Firebug.chrome.select(sourceLink);
    },

    getRealObject: function(script, context)
    {
        return script;
    },

    getTooltip: function(script)
    {
        return $STRF("jsdIScript", [script.tag]);
    },

    getTitle: function(script, context)
    {
        var fn = unwrapIValue(script.functionObject);
        return FirebugReps.Func.getTitle(fn, context);
    },

    getContextMenuItems: function(script, target, context)
    {
        var fn = unwrapIValue(script.functionObject);

        var scriptInfo = Firebug.SourceFile.getSourceFileAndLineByScript(context, script);
           var monitored = scriptInfo ? fbs.isMonitored(scriptInfo.sourceFile.href, scriptInfo.lineNo) : false;

        var name = getFunctionName(script, context);

        return [
            {label: "CopySource", command: bindFixed(this.copySource, this, script) },
            "-",
            {label: $STRF("ShowCallsInConsole", [name]), nol10n: true,
             type: "checkbox", checked: monitored,
             command: bindFixed(this.monitor, this, fn, script, monitored) }
        ];
    }
});

//************************************************************************************************

this.Obj = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK(
            SPAN({class: "objectTitle"}, "$object|getTitle"),
            FOR("prop", "$object|propIterator",
                " $prop.name=",
                SPAN({class: "objectPropValue"}, "$prop.value|cropMultipleLines")
            )
        ),

    propIterator: function (object)
    {
        if (!object)
            return [];

        var props = [];
        var len = 0, iteration = 0;

        try
        {
            for (var name in object)
            {
                var val;
                try
                {
                    val = object[name];
                }
                catch (exc)
                {
                    continue;
                }

                var t = typeof(val);
                if (t == "boolean" || t == "number" || (t == "string" && val)
                    || (t == "object" && val && val.toString))
                {
                    var title = (t == "object")
                        ? Firebug.getRep(val).getTitle(val)
                        : val+"";

                    iteration++;
                    if (iteration > 3)
                    {
                        len += name.length + title.length + 1;
                        if (len < 50)
                            props.push({name: name, value: title});
                        else
                            break;
                    }
                }
            }
        }
        catch (exc)
        {
            // Sometimes we get exceptions when trying to read from certain objects, like
            // StorageList, but don't let that gum up the works
            // XXXjjb also History.previous fails because object is a web-page object which does not have
            // permission to read the history
        }
        return props;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "object",

    supportsObject: function(object, type)
    {
        return true;
    }
});


// ************************************************************************************************

this.Arr = domplate(Firebug.Rep,
{
    tag:
        OBJECTBOX({_repObject: "$object",
            $hasTwisty: "$object|hasSpecialProperties",
            onclick: "$onToggleProperties"},
            SPAN({"class": "arrayLeftBracket", role: "presentation"}, "["),
            FOR("item", "$object|arrayIterator",
                TAG("$item.tag", {object: "$item.object"}),
                SPAN({"class": "arrayComma", role: "presentation"}, "$item.delim")
            ),
            SPAN({"class": "arrayRightBracket", role: "presentation"}, "]"),
            SPAN({"class": "arrayProperties", role: "group"})
        ),

    shortTag:
        OBJECTBOX({_repObject: "$object",
            $hasTwisty: "$object|hasSpecialProperties",
            onclick: "$onToggleProperties"},
            SPAN({"class": "arrayLeftBracket", role: "presentation"}, "["),
            FOR("item", "$object|shortArrayIterator",
                TAG("$item.tag", {object: "$item.object"}),
                SPAN({"class": "arrayComma", role: "presentation"}, "$item.delim")
            ),
            FOR("prop", "$object|shortPropIterator",
                " $prop.name=",
                SPAN({"class": "objectPropValue"}, "$prop.value|cropString")
            ),
            SPAN({"class": "arrayRightBracket"}, "]"),
            SPAN({"class": "arrayProperties", role: "group"})
        ),

    arrayIterator: function(array)
    {
        var items = [];
        for (var i = 0; i < array.length; ++i)
        {
            var value = array[i];
            var rep = Firebug.getRep(value);
            var tag = rep.shortTag ? rep.shortTag : rep.tag;
            var delim = (i == array.length-1 ? "" : ", ");

            items.push({object: value, tag: tag, delim: delim});
        }

        return items;
    },

    shortArrayIterator: function(array)
    {
        var items = [];
        for (var i = 0; i < array.length && i < 3; ++i)
        {
            var value = array[i];
            var rep = Firebug.getRep(value);
            var tag = rep.shortTag ? rep.shortTag : rep.tag;
            var delim = (i == array.length-1 ? "" : ", ");

            items.push({object: value, tag: tag, delim: delim});
        }

        if (array.length > 3)
            items.push({object: (array.length-3) + " more...", //xxxHonza localization
                tag: FirebugReps.Caption.tag, delim: ""});

        return items;
    },

    shortPropIterator: this.Obj.propIterator,
    toggles: {},

    getItemIndex: function(child)
    {
        var arrayIndex = 0;
        for (child = child.previousSibling; child; child = child.previousSibling)
        {
            if (child.repObject)
                ++arrayIndex;
        }
        return arrayIndex;
    },

    hasSpecialProperties: function(array)
    {
        return (array.length != array.__count__) && hasProperties(array);
    },

    onToggleProperties: function(event)
    {
        var target = event.originalTarget;
        if (hasClass(target, "objectBox-array"))
        {
            toggleClass(target, "opened");

            var propBox = target.getElementsByClassName("arrayProperties").item(0);
            if (hasClass(target, "opened"))
                Firebug.DOMPanel.DirTable.tag.replace(
                    {object: target.repObject, toggles: this.toggles}, propBox);
            else
                clearNode(propBox);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "array",

    supportsObject: function(object)
    {
        return this.isArray(object);
    },

    // http://code.google.com/p/fbug/issues/detail?id=874
    // BEGIN Yahoo BSD Source (modified here)  YAHOO.lang.isArray, YUI 2.2.2 June 2007
    isArray: function(obj) {
        try {
            if (!obj)
                return false;
            else if (obj instanceof Ci.nsIDOMHistory) // do this first to avoid security 1000 errors
                return false;
            else if (obj instanceof StorageList) // do this first to avoid security 1000 errors
                return false;
            else if (isFinite(obj.length) && typeof obj.splice === 'function')
                return true;
            else if (isFinite(obj.length) && typeof obj.callee === 'function') // arguments
                return true;
            else if (obj instanceof HTMLCollection)
                return true;
            else if (obj instanceof NodeList)
                return true;
            else
                return false;
        }
        catch(exc)
        {
            if (FBTrace.DBG_ERRORS)
            {
                FBTrace.sysout("isArray FAILS:", exc);  /* Something weird: without the try/catch, OOM, with no exception?? */
                FBTrace.sysout("isArray Fails on obj "+obj);
            }
        }

        return false;
    },
    // END Yahoo BSD SOURCE See license below.

    getTitle: function(object, context)
    {
        return "[" + object.length + "]";
    }
});

// ************************************************************************************************

this.Property = domplate(Firebug.Rep,
{
    supportsObject: function(object)
    {
        return object instanceof Property;
    },

    getRealObject: function(prop, context)
    {
        return prop.object[prop.name];
    },

    getTitle: function(prop, context)
    {
        return prop.name;
    }
});

// ************************************************************************************************

this.NetFile = domplate(this.Obj,
{
    supportsObject: function(object)
    {
        return object instanceof Firebug.NetFile;
    },

    browseObject: function(file, context)
    {
        openNewTab(file.href);
        return true;
    },

    getRealObject: function(file, context)
    {
        return null;
    }
});

// ************************************************************************************************

this.Except = domplate(Firebug.Rep,
{
    tag:
        OBJECTBOX({_repObject: "$object"}, "$object.message"),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "exception",

    supportsObject: function(object)
    {
        return object instanceof ErrorCopy;
    }
});


// ************************************************************************************************

this.Element = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK(
            "&lt;",
            SPAN({class: "nodeTag"}, "$object.localName|toLowerCase"),
            FOR("attr", "$object|attrIterator",
                "&nbsp;$attr.localName=&quot;", SPAN({class: "nodeValue"}, "$attr.nodeValue"), "&quot;"
            ),
            "&gt;"
         ),

    shortTag:
        OBJECTLINK(
            SPAN({class: "$object|getVisible"},
                SPAN({class: "selectorTag"}, "$object|getSelectorTag"),
                SPAN({class: "selectorId"}, "$object|getSelectorId"),
                SPAN({class: "selectorClass"}, "$object|getSelectorClass"),
                SPAN({class: "selectorValue"}, "$object|getValue")
            )
         ),

    getVisible: function(elt)
    {
        return isVisible(elt) ? "" : "selectorHidden";
    },

    getSelectorTag: function(elt)
    {
        return elt.localName.toLowerCase();
    },

    getSelectorId: function(elt)
    {
        return elt.id ? ("#" + elt.id) : "";
    },

    getSelectorClass: function(elt)
    {
        return elt.getAttribute("class")
            ? ("." + elt.getAttribute("class").split(" ")[0])
            : "";
    },

    getValue: function(elt)
    {
        var value;

        if (elt instanceof HTMLImageElement)
            value = getFileName(elt.getAttribute("src"));
        else if (elt instanceof HTMLAnchorElement)
            value = getFileName(elt.getAttribute("href"));
        else if (elt instanceof HTMLInputElement)
            value = elt.getAttribute("value");
        else if (elt instanceof HTMLFormElement)
            value = getFileName(elt.getAttribute("action"));
        else if (elt instanceof HTMLScriptElement)
            value = getFileName(elt.getAttribute("src"));

        return value ? " " + cropMultipleLines(value, 20) : "";
     },

     attrIterator: function(elt)
     {
         var attrs = [];
         var idAttr, classAttr;
         if (elt.attributes)
         {
             for (var i = 0; i < elt.attributes.length; ++i)
             {
                 var attr = elt.attributes[i];
                 if (attr.localName.indexOf("-moz-math") != -1)
                     continue;
                 if (attr.localName.indexOf("firebug-") != -1)
                     continue;
                 else if (attr.localName == "id")
                     idAttr = attr;
                 else if (attr.localName == "class")
                     classAttr = attr;
                 else
                     attrs.push(attr);
             }
         }
         if (classAttr)
            attrs.splice(0, 0, classAttr);
        if (idAttr)
           attrs.splice(0, 0, idAttr);
         return attrs;
     },

     shortAttrIterator: function(elt)
     {
         var attrs = [];
         if (elt.attributes)
         {
             for (var i = 0; i < elt.attributes.length; ++i)
             {
                 var attr = elt.attributes[i];
                 if (attr.localName == "id" || attr.localName == "class")
                     attrs.push(attr);
             }
         }

         return attrs;
     },

     getHidden: function(elt)
     {
         return isVisible(elt) ? "" : "nodeHidden";
     },

     getXPath: function(elt)
     {
         return getElementTreeXPath(elt);
     },

     getNodeTextGroups: function(element)
     {
         var text =  element.textContent;
         if (!Firebug.showFullTextNodes)
         {
             text=cropString(text,50);
         }

         var escapeGroups=[];

         if (Firebug.showTextNodesWithWhitespace)
             escapeGroups.push({
                'group': 'whitespace',
                'class': 'nodeWhiteSpace',
                'extra': {
                    '\t': '_Tab',
                    '\n': '_Para',
                    ' ' : '_Space'
                }
             });
         if (Firebug.showTextNodesWithEntities)
             escapeGroups.push({
                 'group':'text',
                 'class':'nodeTextEntity',
                 'extra':{}
             });

         if (escapeGroups.length)
             return escapeGroupsForEntities(text, escapeGroups);
         else
             return [{str:text,'class':'',extra:''}];
     },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    copyHTML: function(elt)
    {
        var html = getElementHTML(elt);
        copyToClipboard(html);
    },

    copyInnerHTML: function(elt)
    {
        copyToClipboard(elt.innerHTML);
    },

    copyXPath: function(elt)
    {
        var xpath = getElementXPath(elt);
        copyToClipboard(xpath);
    },

    persistor: function(context, xpath)
    {
        var elts = xpath
            ? getElementsByXPath(context.window.document, xpath)
            : null;

        return elts && elts.length ? elts[0] : null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "element",

    supportsObject: function(object)
    {
        return object instanceof Element;
    },

    browseObject: function(elt, context)
    {
        var tag = elt.localName.toLowerCase();
        if (tag == "script")
            openNewTab(elt.src);
        else if (tag == "link")
            openNewTab(elt.href);
        else if (tag == "a")
            openNewTab(elt.href);
        else if (tag == "img")
            openNewTab(elt.src);

        return true;
    },

    persistObject: function(elt, context)
    {
        var xpath = getElementXPath(elt);

        return bind(this.persistor, top, xpath);
    },

    getTitle: function(element, context)
    {
        return getElementCSSSelector(element);
    },

    getTooltip: function(elt)
    {
        return this.getXPath(elt);
    },

    getContextMenuItems: function(elt, target, context)
    {
        var monitored = areEventsMonitored(elt, null, context);
        var CopyElement = "CopyHTML";
        if (isElementSVG(elt))
            CopyElement = "CopySVG";
        if (isElementMathML(elt))
            CopyElement = "CopyMathML";

        var items=[{label: CopyElement, command: bindFixed(this.copyHTML, this, elt)}];
        if (!isElementSVG(elt) && !isElementMathML(elt))
            items.push({label: "CopyInnerHTML", command: bindFixed(this.copyInnerHTML, this, elt) });

        return items.concat([
            {label: "CopyXPath", command: bindFixed(this.copyXPath, this, elt) },
            "-",
            {label: "ShowEventsInConsole", type: "checkbox", checked: monitored,
             command: bindFixed(toggleMonitorEvents, FBL, elt, null, monitored, context) },
            "-",
            {label: "ScrollIntoView", command: bindFixed(elt.scrollIntoView, elt) }
        ]);
    }
});

// ************************************************************************************************

this.TextNode = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK(
            "&lt;",
            SPAN({class: "nodeTag"}, "TextNode"),
            "&nbsp;textContent=&quot;", SPAN({class: "nodeValue"}, "$object.textContent|cropMultipleLines"), "&quot;",
            "&gt;"
            ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "textNode",

    inspectObject: function(node, context)
    {
        // Text nodes have two displays in HTML panel, inline and distinct
        // node. We need to examine which case we are dealing with in order to
        // select the proper object.
        if (Firebug.HTMLLib.hasNoElementChildren(node.parentNode))
        {
            node = node.parentNode;
        }

        Firebug.chrome.select(node, "html", "domSide");
    },

    supportsObject: function(object)
    {
        return object instanceof Text;
    },

    getTitle: function(win, context)
    {
        return "textNode";
    }
});

// ************************************************************************************************

this.Document = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK("Document ", SPAN({class: "objectPropValue"}, "$object|getLocation")),

    getLocation: function(doc)
    {
        return doc.location ? getFileName(doc.location.href) : "";
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "object",

    supportsObject: function(object)
    {
        return object instanceof Document || object instanceof XMLDocument;
    },

    browseObject: function(doc, context)
    {
        openNewTab(doc.location.href);
        return true;
    },

    persistObject: function(doc, context)
    {
        return this.persistor;
    },

    persistor: function(context)
    {
        return context.window.document;
    },

    getTitle: function(win, context)
    {
        return "document";
    },

    getTooltip: function(doc)
    {
        return doc.location.href;
    }
});

// ************************************************************************************************

this.StyleSheet = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK("StyleSheet ", SPAN({class: "objectPropValue"}, "$object|getLocation")),

    getLocation: function(styleSheet)
    {
        return getFileName(styleSheet.href);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    copyURL: function(styleSheet)
    {
        copyToClipboard(styleSheet.href);
    },

    openInTab: function(styleSheet)
    {
        openNewTab(styleSheet.href);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "object",

    supportsObject: function(object)
    {
        return object instanceof CSSStyleSheet;
    },

    browseObject: function(styleSheet, context)
    {
        openNewTab(styleSheet.href);
        return true;
    },

    persistObject: function(styleSheet, context)
    {
        return bind(this.persistor, top, styleSheet.href);
    },

    getTooltip: function(styleSheet)
    {
        return styleSheet.href;
    },

    getContextMenuItems: function(styleSheet, target, context)
    {
        return [
            {label: "CopyLocation", command: bindFixed(this.copyURL, this, styleSheet) },
            "-",
            {label: "OpenInTab", command: bindFixed(this.openInTab, this, styleSheet) }
        ];
    },

    persistor: function(context, href)
    {
        return getStyleSheetByHref(href, context);
    }
});

// ************************************************************************************************

this.Window = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK("Window ", SPAN({class: "objectPropValue"}, "$object|getLocation")),

    getLocation: function(win)
    {
        try
        {
            return (win && win.location && !win.closed) ? getFileName(win.location.href) : "";
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("reps.Window window closed?");
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "object",

    supportsObject: function(object)
    {
        return object instanceof Window;
    },

    browseObject: function(win, context)
    {
        openNewTab(win.location.href);
        return true;
    },

    persistObject: function(win, context)
    {
        return this.persistor;
    },

    persistor: function(context)
    {
        return context.window;
    },

    getTitle: function(win, context)
    {
        return "window";
    },

    getTooltip: function(win)
    {
        if (win && !win.closed)
            return win.location.href;
    }
});

// ************************************************************************************************

this.Event = domplate(Firebug.Rep,
{
    tag: TAG("$copyEventTag", {object: "$object|copyEvent"}),

    copyEventTag:
        OBJECTLINK("$object|summarizeEvent"),

    summarizeEvent: function(event)
    {
        var info = [event.type, ' '];

        var eventFamily = getEventFamily(event.type);
        if (eventFamily == "mouse")
            info.push("clientX=", event.clientX, ", clientY=", event.clientY);
        else if (eventFamily == "key")
            info.push("charCode=", event.charCode, ", keyCode=", event.keyCode);

        return info.join("");
    },

    copyEvent: function(event)
    {
        return new EventCopy(event);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "object",

    supportsObject: function(object)
    {
        return object instanceof Event || object instanceof EventCopy;
    },

    getTitle: function(event, context)
    {
        return "Event " + event.type;
    }
});

// ************************************************************************************************

this.SourceLink = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK(
            {$collapsed: "$object|hideSourceLink"},
            DIV("$object|getSourceLinkTitle"),
            DIV({$systemLink: "$object|isSystemLink"}, "$object|getSystemFlagTitle")),

    isSystemLink: function(sourceLink)
    {
        return sourceLink && isSystemURL(sourceLink.href);
    },

    hideSourceLink: function(sourceLink)
    {
        return sourceLink ? sourceLink.href.indexOf("XPCSafeJSObjectWrapper") != -1 : true;
    },

    getSourceLinkTitle: function(sourceLink)
    {
        if (!sourceLink)
            return "";

        try
        {
            var fileName = getFileName(sourceLink.href);
            fileName = decodeURIComponent(fileName);
            fileName = cropString(fileName, 17);
        }
        catch(exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("reps.getSourceLinkTitle decodeURIComponent fails for \'"+fileName+"\': "+exc, exc);
        }
        if (sourceLink.instance)
            return $STRF("InstanceLine", [fileName, sourceLink.instance+1, sourceLink.line]);
        else
            return $STRF("Line", [fileName, sourceLink.line]);
    },

    getSystemFlagTitle: function(sourceLink)
    {
        if (this.isSystemLink(sourceLink))
            return $STRF("SystemItem", [""]);
        else
            return "";
    },

    copyLink: function(sourceLink)
    {
        copyToClipboard(sourceLink.href);
    },

    openInTab: function(sourceLink)
    {
        openNewTab(sourceLink.href);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "sourceLink",

    supportsObject: function(object)
    {
        return object instanceof SourceLink;
    },

    getTooltip: function(sourceLink)
    {
        return decodeURI(sourceLink.href);
    },

    inspectObject: function(sourceLink, context)
    {
        if (sourceLink.type == "js")
        {
            var scriptFile = getSourceFileByHref(sourceLink.href, context);
            if (scriptFile)
                return Firebug.chrome.select(sourceLink);
        }
        else if (sourceLink.type == "css")
        {
            // If an object is defined, treat it as the highest priority for
            // inspect actions
            if (sourceLink.object) {
                Firebug.chrome.select(sourceLink.object);
                return;
            }

            var stylesheet = getStyleSheetByHref(sourceLink.href, context);
            if (stylesheet)
            {
                var ownerNode = stylesheet.ownerNode;
                if (ownerNode)
                {
                    Firebug.chrome.select(sourceLink, "html");
                    return;
                }

                var panel = context.getPanel("stylesheet");
                if (panel && panel.getRuleByLine(stylesheet, sourceLink.line))
                    return Firebug.chrome.select(sourceLink);
            }
        }

        // Fallback is to just open the view-source window on the file
        viewSource(sourceLink.href, sourceLink.line);
    },

    browseObject: function(sourceLink, context)
    {
        openNewTab(sourceLink.href);
        return true;
    },

    getContextMenuItems: function(sourceLink, target, context)
    {
        return [
            {label: "CopyLocation", command: bindFixed(this.copyLink, this, sourceLink) },
            "-",
            {label: "OpenInTab", command: bindFixed(this.openInTab, this, sourceLink) }
        ];
    }
});

// ************************************************************************************************

this.SourceFile = domplate(this.SourceLink,
{
    tag:
        OBJECTLINK({$collapsed: "$object|hideSourceLink"}, "$object|getSourceLinkTitle"),

    persistor: function(context, href)
    {
        return getSourceFileByHref(href, context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "sourceFile",

    supportsObject: function(object)
    {
        return object instanceof Firebug.SourceFile;
    },

    persistObject: function(sourceFile)
    {
        return bind(this.persistor, top, sourceFile.href);
    },

    browseObject: function(sourceLink, context)
    {
    },

    getTooltip: function(sourceFile)
    {
        return sourceFile.href;
    }
});

// ************************************************************************************************

this.StackFrame = domplate(Firebug.Rep,  // XXXjjb Since the repObject is fn the stack does not have correct line numbers
{
    tag:
        OBJECTBLOCK(
            A({class: "objectLink a11yFocus", _repObject: "$object"}, "$object|getCallName"),
            SPAN("("),
            FOR("arg", "$object|argIterator",
                TAG("$arg.tag", {object: "$arg.value"}),
                SPAN({class: "arrayComma"}, "$arg.delim")
            ),
            SPAN(")"),
            SPAN({class: "objectLink-sourceLink objectLink a11yFocus",
                _repObject: "$object|getSourceLink",
                role: "link"},
                "$object|getSourceLinkTitle")
        ),

    getCallName: function(frame)
    {
        if (frame.fn && frame.fn != "anonymous")
            return frame.fn;
        return getFunctionName(frame.script, frame.context, null, true);
    },

    getSourceLinkTitle: function(frame)
    {
        var fileName = cropString(getFileName(frame.href), 17);
        return $STRF("Line", [fileName, frame.line]);
    },

    argIterator: function(frame)
    {
        if (!frame.args)
            return [];

        var items = [];

        for (var i = 0; i < frame.args.length; ++i)
        {
            var arg = frame.args[i];

            if (!arg)
                break;

            if (arg.value) // then we got these from jsd
            {
                var rep = Firebug.getRep(arg.value);
                var tag = rep.shortTag ? rep.shortTag : rep.tag;

                var delim = (i == frame.args.length-1 ? "" : ", ");

                items.push({name: arg.name, value: arg.value, tag: tag, delim: delim});
            }
            else  // eg from Error object
            {
                var delim = (i == frame.args.length-1 ? "" : ", ");
                var rep = Firebug.getRep(arg);
                var tag = rep.shortTag ? rep.shortTag : rep.tag;

                items.push({value: arg, tag: tag, delim: delim});
            }
        }

        return items;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "stackFrame",

    supportsObject: function(object)
    {
        return object instanceof StackFrame;
    },

    inspectObject: function(stackFrame, context)
    {
        Firebug.chrome.select(this.getSourceLink(stackFrame));
    },

    getTooltip: function(stackFrame, context)
    {
        return $STRF("Line", [stackFrame.href, stackFrame.line]);
    },

    getSourceLink: function(stackFrame)
    {
        var sourceLink = new SourceLink(stackFrame.href, stackFrame.line, "js");
        return sourceLink;
    },
});

// ************************************************************************************************

this.StackTrace = domplate(Firebug.Rep,
{
    tag:
        DIV({role : "group", 'aria-label' : $STR('aria.labels.stack trace')},
            FOR("frame", "$object.frames",
                TAG(this.StackFrame.tag, {object: "$frame"})
            )
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "stackTrace",

    supportsObject: function(object)
    {
        return object instanceof StackTrace;
    }
});

// ************************************************************************************************

this.jsdStackFrame = domplate(Firebug.Rep,
{
    inspectable: false,

    className: "jsdIStactFrame",

    supportsObject: function(object)
    {
        return (object instanceof jsdIStackFrame);
    },

    getTitle: function(frame, context)
    {
        if (!frame.isValid) return "(invalid frame)"; // XXXjjb avoid frame.script == null
        return getFunctionName(frame.script, context);
    },

    getTooltip: function(frame, context)
    {
        if (!frame.isValid) return "(invalid frame; did Firebug suspend?)";  // XXXjjb avoid frame.script == null
        var sourceInfo = Firebug.SourceFile.getSourceFileAndLineByScript(context, frame.script, frame);
        if (sourceInfo)
            return $STRF("Line", [sourceInfo.sourceFile.href, sourceInfo.lineNo]);
        else
            return $STRF("Line", [frame.script.fileName, frame.line]);
    },

    getContextMenuItems: function(frame, target, context)
    {
        var fn = unwrapIValue(frame.script.functionObject);
        return FirebugReps.Func.getContextMenuItems(fn, target, context, frame.script);
    }
});

// ************************************************************************************************

this.ErrorMessage = domplate(Firebug.Rep,
{
    tag:
        OBJECTBOX({
                $hasTwisty: "$object|hasStackTrace",
                $hasBreakSwitch: "$object|hasBreakSwitch",
                $breakForError: "$object|hasErrorBreak",
                _repObject: "$object",
                _stackTrace: "$object|getLastErrorStackTrace",
                onclick: "$onToggleError"},

            DIV({class: "errorTitle focusRow subLogRow", role : 'listitem'},
                "$object.message|getMessage",
                SPAN({class: "errorDuplication"}, "$object.msgId|getDuplication")
            ),
            DIV({class: "errorTrace", role : 'presentation'}),
            DIV({class: "errorSourceBox errorSource-$object|getSourceType focusRow subLogRow", role : "listitem"},
                IMG({class: "errorBreak a11yFocus", src:"blank.gif", role : 'checkbox', 'aria-checked':"$object|hasErrorBreak", title: "Break on this error"}),
                A({class: "errorSource a11yFocus"}, "$object|getLine"),
                TAG(this.SourceLink.tag, {object: "$object|getSourceLink"})
            )
        ),

    getLastErrorStackTrace: function(error)
    {
        return error.trace;
    },

    hasStackTrace: function(error)
    {
        var url = error.href.toString();
        var fromCommandLine = (url.indexOf("XPCSafeJSObjectWrapper") != -1);
        return !fromCommandLine && error.trace;
    },

    hasBreakSwitch: function(error)
    {
        return error.href && error.lineNo > 0;
    },

    hasErrorBreak: function(error)
    {
        return fbs.hasErrorBreakpoint(normalizeURL(error.href), error.lineNo);
    },

    getMessage: function(message)
    {
        var re = /\[Exception... "(.*?)" nsresult:/;
        var m = re.exec(message);
        return m ? m[1] : message;
    },

    getDuplication: function(msgId)
    {
        return ""; // filled in later
    },

    getLine: function(error)
    {
        if (error.source)
            return cropMultipleLines(error.source, 80);
        if (error.category == "js" && error.href && error.href.indexOf("XPCSafeJSObjectWrapper") != -1)
            return "";
        return cropString(error.getSourceLine(), 80);
    },

    getSourceLink: function(error)
    {
        var ext = error.category == "css" ? "css" : "js";
        return error.lineNo ? new SourceLink(error.href, error.lineNo, ext) : null;
    },

    getSourceType: function(error)
    {
        // Errors occurring inside of HTML event handlers look like "foo.html (line 1)"
        // so let's try to skip those
        if (error.source)
            return "syntax";
        else if (error.lineNo == 1 && getFileExtension(error.href) != "js")
            return "none";
        else if (error.category == "css")
            return "show";
        else if (!error.href || !error.lineNo)
            return "none";
        else
            return "show";
    },

    onToggleError: function(event)
    {
        var target = event.currentTarget;
        if (hasClass(event.target, "errorBreak"))
        {
            var panel = Firebug.getElementPanel(event.target);
            this.breakOnThisError(target.repObject, panel.context);
        }
        else if (hasClass(event.target, "errorSource"))
        {
            var panel = Firebug.getElementPanel(event.target);
            this.inspectObject(target.repObject, panel.context);
        }
        else if (hasClass(event.target, "errorTitle"))
        {
            var traceBox = target.childNodes[1];
            toggleClass(target, "opened");
            event.target.setAttribute('aria-expanded', hasClass(target, "opened"));
            if (hasClass(target, "opened"))
            {
                if (target.stackTrace)
                    var node = FirebugReps.StackTrace.tag.append({object: target.stackTrace}, traceBox);
                if (Firebug.A11yModel.enabled)
                {
                    var panel = Firebug.getElementPanel(event.target);
                    dispatch([Firebug.A11yModel], "modifyLogRow", [panel , traceBox]);
                }
            }
            else
                clearNode(traceBox);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    copyError: function(error)
    {
        var message = [
            this.getMessage(error.message),
            error.href,
            "Line " +  error.lineNo
        ];
        copyToClipboard(message.join("\n"));
    },

    breakOnThisError: function(error, context)
    {

        var sourceFile = context.sourceFileMap[normalizeURL(error.href)];
        if (!sourceFile)
        {
            Firebug.Console.logFormatted(["reps.breakOnThisError has not source file for error.href: "+error.href, error], context, 'error', true);
            return;
        }

        if (this.hasErrorBreak(error))
            Firebug.Debugger.clearErrorBreakpoint(sourceFile, error.lineNo);
        else
            Firebug.Debugger.setErrorBreakpoint(sourceFile, error.lineNo);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "errorMessage",
    inspectable: false,

    supportsObject: function(object)
    {
        return object instanceof ErrorMessage;
    },

    inspectObject: function(error, context)
    {
        var sourceLink = this.getSourceLink(error);
        FirebugReps.SourceLink.inspectObject(sourceLink, context);
    },

    getContextMenuItems: function(error, target, context)
    {
        var breakOnThisError = this.hasErrorBreak(error);

        var items = [
            {label: "CopyError", command: bindFixed(this.copyError, this, error) }
        ];

        if (error.category == "css")
        {
            items.push(
                "-",
                {label: "BreakOnThisError", type: "checkbox", checked: breakOnThisError,
                 command: bindFixed(this.breakOnThisError, this, error) },

                optionMenu("BreakOnAllErrors", "breakOnErrors")
            );
        }

        return items;
    }
});

// ************************************************************************************************

this.Assert = domplate(Firebug.Rep,
{
    tag:
        DIV(
            DIV({class: "errorTitle"}),
            DIV({class: "assertDescription"})
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "assert",

    inspectObject: function(error, context)
    {
        var sourceLink = this.getSourceLink(error);
        Firebug.chrome.select(sourceLink);
    },

    getContextMenuItems: function(error, target, context)
    {
        var breakOnThisError = this.hasErrorBreak(error);

        return [
            {label: "CopyError", command: bindFixed(this.copyError, this, error) },
            "-",
            {label: "BreakOnThisError", type: "checkbox", checked: breakOnThisError,
             command: bindFixed(this.breakOnThisError, this, error) },
            {label: "BreakOnAllErrors", type: "checkbox", checked: Firebug.breakOnErrors,
             command: bindFixed(this.breakOnAllErrors, this, error) }
        ];
    }
});

// ************************************************************************************************

this.SourceText = domplate(Firebug.Rep,
{
    tag:
        DIV(
            FOR("line", "$object|lineIterator",
                DIV({class: "sourceRow", role : "presentation"},
                    SPAN({class: "sourceLine", role : "presentation"}, "$line.lineNo"),
                    SPAN({class: "sourceRowText", role : "presentation"}, "$line.text")
                )
            )
        ),

    lineIterator: function(sourceText)
    {
        var maxLineNoChars = (sourceText.lines.length + "").length;
        var list = [];

        for (var i = 0; i < sourceText.lines.length; ++i)
        {
            // Make sure all line numbers are the same width (with a fixed-width font)
            var lineNo = (i+1) + "";
            while (lineNo.length < maxLineNoChars)
                lineNo = " " + lineNo;

            list.push({lineNo: lineNo, text: sourceText.lines[i]});
        }

        return list;
    },

    getHTML: function(sourceText)
    {
        return getSourceLineRange(sourceText, 1, sourceText.lines.length);
    }
});

//************************************************************************************************

this.nsIDOMHistory = domplate(Firebug.Rep,
{
    tag:OBJECTBOX({onclick: "$showHistory"},
            OBJECTLINK("$object|summarizeHistory")
        ),

    className: "nsIDOMHistory",

    summarizeHistory: function(history)
    {
        try
        {
            var items = history.length;
            return items + " history entries";
        }
        catch(exc)
        {
            return "object does not support history (nsIDOMHistory)";
        }
    },

    showHistory: function(history)
    {
        try
        {
            var items = history.length;  // if this throws, then unsupported
            Firebug.chrome.select(history);
        }
        catch (exc)
        {
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    supportsObject: function(object, type)
    {
        return (object instanceof Ci.nsIDOMHistory);
    }
});

// ************************************************************************************************

this.ApplicationCache = domplate(Firebug.Rep,
{
    tag:OBJECTBOX({onclick: "$showApplicationCache"},
            OBJECTLINK("$object|summarizeCache")
        ),

    summarizeCache: function(applicationCache)
    {
        try
        {
            return applicationCache.length + " items in offline cache";
        }
        catch(exc)
        {
            return "https://bugzilla.mozilla.org/show_bug.cgi?id=422264";
        }
    },

    showApplicationCache: function(event)
    {
        openNewTab("https://bugzilla.mozilla.org/show_bug.cgi?id=422264");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "applicationCache",

    supportsObject: function(object, type)
    {
        if (Ci.nsIDOMOfflineResourceList)
            return (object instanceof Ci.nsIDOMOfflineResourceList);
    }

});

this.Storage = domplate(Firebug.Rep,
{
    tag: OBJECTBOX({onclick: "$show"}, OBJECTLINK("$object|summarize")),

    summarize: function(storage)
    {
        return storage.length +" items in Storage";
    },
    show: function(storage)
    {
        openNewTab("http://dev.w3.org/html5/webstorage/#storage-0");
    },
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "Storage",

    supportsObject: function(object, type)
    {
        return (object instanceof Storage);
    }

});

// ************************************************************************************************

Firebug.registerRep(
    this.nsIDOMHistory, // make this early to avoid exceptions
    this.Undefined,
    this.Null,
    this.Number,
    this.String,
    this.Window,
    this.ApplicationCache, // must come before Arr (array) else exceptions.
    this.ErrorMessage,
    this.Element,
    this.TextNode,
    this.Document,
    this.StyleSheet,
    this.Event,
    this.SourceLink,
    this.SourceFile,
    this.StackTrace,
    this.StackFrame,
    this.jsdStackFrame,
    this.jsdScript,
    this.NetFile,
    this.Property,
    this.Except,
    this.XML,
    this.Arr
);

Firebug.setDefaultReps(this.Func, this.Obj);

}});

// ************************************************************************************************
/*
 * The following is http://developer.yahoo.com/yui/license.txt and applies to only code labeled "Yahoo BSD Source"
 * in only this file reps.js.  John J. Barton June 2007.
 *
Software License Agreement (BSD License)

Copyright (c) 2006, Yahoo! Inc.
All rights reserved.

Redistribution and use of this software in source and binary forms, with or without modification, are
permitted provided that the following conditions are met:

* Redistributions of source code must retain the above
  copyright notice, this list of conditions and the
  following disclaimer.

* Redistributions in binary form must reproduce the above
  copyright notice, this list of conditions and the
  following disclaimer in the documentation and/or other
  materials provided with the distribution.

* Neither the name of Yahoo! Inc. nor the names of its
  contributors may be used to endorse or promote products
  derived from this software without specific prior
  written permission of Yahoo! Inc.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED
WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * /
 */
