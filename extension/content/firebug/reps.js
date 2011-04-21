/* See license.txt for terms of usage */

// Set this global to an empty object, and populate the object during FBL.initialize
var FirebugReps = FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

Components.utils.import("resource://firebug/firebug-service.js");

// ************************************************************************************************
// Common Tags

var OBJECTBOX = FirebugReps.OBJECTBOX =
    SPAN({"class": "objectBox objectBox-$className", role : "presentation"});

var OBJECTBLOCK = FirebugReps.OBJECTBLOCK =
    DIV({"class": "objectBox objectBox-$className focusRow subLogRow", role : "listitem"});

var OBJECTLINK = FirebugReps.OBJECTLINK =
    A({
        "class": "objectLink objectLink-$className a11yFocus",
        _repObject: "$object"
    });

// ************************************************************************************************

FirebugReps.Undefined = domplate(Firebug.Rep,
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

FirebugReps.Null = domplate(Firebug.Rep,
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

FirebugReps.Nada = domplate(Firebug.Rep,
{
    tag: SPAN(""),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "nada"
});

// ************************************************************************************************

FirebugReps.Number = domplate(Firebug.Rep,
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

FirebugReps.String = domplate(Firebug.Rep,
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

FirebugReps.XML = domplate(Firebug.Rep,
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

FirebugReps.Text = domplate(Firebug.Rep,
{
    tag: OBJECTBOX("$object"),

    shortTag: OBJECTBOX("$object|cropMultipleLines"),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "text"
});

// ************************************************************************************************

FirebugReps.Caption = domplate(Firebug.Rep,
{
    tag: SPAN({"class": "caption"}, "$object")
});

// ************************************************************************************************

FirebugReps.Warning = domplate(Firebug.Rep,
{
    tag: DIV({"class": "warning focusRow", role : 'listitem'}, "$object|STR")
});

// ************************************************************************************************

FirebugReps.Func = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK("$object|summarizeFunction"),

    summarizeFunction: function(fn)
    {
        var fnText = safeToString(fn);
        var namedFn = /^function ([^(]+\([^)]*\)) \{/.exec(fnText);
        var anonFn  = /^function \(/.test(fnText);
        return namedFn ? namedFn[1] : (anonFn ? "function()" : fnText);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    copySource: function(fn)
    {
        if (fn && typeof (fn['toSource']) == 'function')
            copyToClipboard(fn.toSource());
    },

    monitor: function(fn, monitored)
    {
        if (monitored)
            Firebug.Debugger.unmonitorFunction(fn,  "monitor");
        else
            Firebug.Debugger.monitorFunction(fn, "monitor");
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
        var script = findScriptForFunctionInContext(context, fn);
        if (script)
            return $STRF("Line", [normalizeURL(script.fileName), script.baseLineNumber]);
        else
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
             command: bindFixed(this.monitor, this, fn, monitored) }
        ];
    }
});

// ************************************************************************************************

FirebugReps.Obj = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK(
            SPAN({"class": "objectTitle"}, "$object|getTitle "),
            SPAN({"class": "objectLeftBrace", role: "presentation"}, "{"),
            FOR("prop", "$object|shortPropIterator",
                " $prop.name",
                SPAN({"class": "objectEqual", role: "presentation"}, "$prop.equal"),
                TAG("$prop.tag", {object: "$prop.object"}),
                SPAN({"class": "objectComma", role: "presentation"}, "$prop.delim")
            ),
            SPAN({"class": "objectRightBrace"}, "}")
        ),

    shortTag:
        OBJECTLINK(
            SPAN({"class": "objectTitle"}, "$object|getTitle "),
            SPAN({"class": "objectLeftBrace", role: "presentation"}, "{"),
            FOR("prop", "$object|shortPropIterator",
                " $prop.name",
                SPAN({"class": "objectEqual", role: "presentation"}, "$prop.equal"),
                TAG("$prop.tag", {object: "$prop.object"}),
                SPAN({"class": "objectComma", role: "presentation"}, "$prop.delim")
            ),
            SPAN({"class": "objectRightBrace"}, "}")
        ),

    titleTag:
        SPAN({"class": "objectTitle"}, "$object|getTitleTag"),

    getTitleTag: function(object)
    {
        var title;
        if (typeof(object) == "string")
            title = object;
        else
            title = this.getTitle(object);

        if (title == "Object")
            title = "{...}";

        return title;
    },

    longPropIterator: function (object)
    {
        return this.propIterator(object,100);
    },

    shortPropIterator: function (object)
    {
        return this.propIterator(object, Firebug.ObjectShortIteratorMax);
    },

    propIterator: function (object, max)
    {
        max = max || 3;
        if (!object)
            return [];

        var props = [];
        var len = 0, count = 0;

        try
        {
            for (var name in object)
            {
                var value;
                try
                {
                    value = object[name];
                }
                catch (exc)
                {
                    continue;
                }

                var t = typeof(value);
                if (t == "boolean" || t == "number" || (t == "string" && value)
                    || (t == "object" && value && value.toString))
                {
                    var rep = Firebug.getRep(value);
                    var tag = rep.shortTag || rep.tag;
                    if (t == "object")
                    {
                        value = rep.getTitle(value);
                        if (rep.titleTag)
                            tag = rep.titleTag;
                        else
                            tag = FirebugReps.Obj.titleTag;
                    }
                    count++;
                    if (count <= max)
                        props.push({tag: tag, name: name, object: value, equal: "=", delim: ", "});
                    else
                        break;
                }
            }
            if (count > max)
            {
                props[Math.max(1,max-1)] = {
                    object: $STR("firebug.reps.more") + "...",
                    tag: FirebugReps.Caption.tag,
                    name: "",
                    equal: "",
                    delim: ""
                };
            }
            else if (props.length > 0)
            {
                props[props.length-1].delim = '';
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

FirebugReps.Arr = domplate(Firebug.Rep,
{
    tag:
        OBJECTBOX({_repObject: "$object",
            $hasTwisty: "$object|hasSpecialProperties",
            onclick: "$onToggleProperties"},
            SPAN({"class": "arrayLeftBracket", role: "presentation"}, "["),
            FOR("item", "$object|longArrayIterator",
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
            SPAN({"class": "arrayRightBracket"}, "]"),
            SPAN({"class": "arrayProperties", role: "group"})
        ),

    longArrayIterator: function(array)
    {
       return this.arrayIterator(array,300);
    },

    shortArrayIterator: function(array)
    {
       return this.arrayIterator(array,3);
    },

    arrayIterator: function(array, max)
    {
        var items = [];
        for (var i = 0; i < array.length && i <= max; ++i)
        {
            try
            {
                var delim = (i == array.length-1 ? "" : ", ");
                var value = array[i];
                var rep = Firebug.getRep(value);
                var tag = rep.shortTag || rep.tag;

                items.push({object: value, tag: tag, delim: delim});
            }
            catch(exc)
            {
                var rep = Firebug.getRep(exc);
                var tag = rep.shortTag || rep.tag;

                items.push({object: exc, tag: tag, delim: delim});
            }
        }

        if (array.length > max + 1)
        {
            items[max] = {
                object: (array.length-max) + " " + $STR("firebug.reps.more") + "...",
                tag: FirebugReps.Caption.tag,
                delim: ""
            };
        }

        return items;
    },

    toggles: new ToggleBranch(),

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
        // Don't use __count__ property, this is being removed from Fx 3.7
        var n = 0;
        for (var p in array)
        {
            try
            {
                if (array.hasOwnProperty(p))
                    n++;
            }
            catch (err)
            {
                FBTrace.sysout("hasSpecialProperties; EXCEPTION " + err, {err:err, array: array, p: p});
            }
        }

        return (array.length != n) && hasProperties(array);
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

    supportsObject: function(object, type)
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
            else if (obj.toString() === "[xpconnect wrapped native prototype]")  // do this first to avoid exceptions
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
            try
            {
                if (FBTrace.DBG_ERRORS)
                {
                    FBTrace.sysout("isArray FAILS: "+exc, exc);  /* Something weird: without the try/catch, OOM, with no exception?? */
                    FBTrace.sysout("isArray Fails on obj "+obj);
                }
            }
            catch(exexc)
            {
                FBTrace.sysout("isArray double ERROR "+exexc, exexc);
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

FirebugReps.Property = domplate(Firebug.Rep,
{
    supportsObject: function(object, type)
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

FirebugReps.NetFile = domplate(FirebugReps.Obj,
{
    supportsObject: function(object, type)
    {
        if (typeof(Firebug.NetFile) == "undefined")
            return false;

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

function instanceOf(object, Klass)
{
    while (object != null)
    {
        if (object == Klass.prototype)
           return true;

        if ( typeof(object) === 'xml')
            return (Klass.prototype === XML.prototype);

        object = object.__proto__;
    }
    return false;
}



// ************************************************************************************************

FirebugReps.Element = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK(
            "&lt;",
            SPAN({"class": "nodeTag"}, "$object|getLocalName"),
            FOR("attr", "$object|attrIterator",
                "&nbsp;$attr.localName=&quot;",
                SPAN({"class": "nodeValue"}, "$attr|getAttrValue"),
                "&quot;"
            ),
            "&gt;"
         ),

    shortTag:
        OBJECTLINK(
            SPAN({"class": "$object|getVisible"},
                SPAN({"class": "selectorTag"}, "$object|getSelectorTag"),
                SPAN({"class": "selectorId"}, "$object|getSelectorId"),
                SPAN({"class": "selectorClass"}, "$object|getSelectorClass"),
                SPAN({"class": "selectorValue"}, "$object|getValue")
            )
         ),

    getLocalName: function(object)
    {
        try
        {
            return getLocalName(object);
        }
        catch (err)
        {
            return "";
        }
    },

    getNodeName: function(object)
    {
        try
        {
            return getNodeName(object);
        }
        catch (err)
        {
            return "";
        }
    },

    getAttrValue: function(attr)
    {
        var limit = Firebug.displayedAttributeValueLimit;
        return (limit > 0) ? cropString(attr.nodeValue, limit) : attr.nodeValue;
    },

    getVisible: function(elt)
    {
        return isVisible(elt) ? "" : "selectorHidden";
    },

    getSelectorTag: function(elt)
    {
        return this.getLocalName(elt);
    },

    getSelectorId: function(elt)
    {
        try
        {
            return elt.id ? ("#" + elt.id) : "";
        }
        catch (e)
        {
            return "";
        }
    },

    getSelectorClass: function(elt)
    {
        try
        {
            return elt.getAttribute("class")
                ? ("." + elt.getAttribute("class").split(" ")[0])
                : "";
        }
        catch (err)
        {
        }
        return "";
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

        // Make sure 'id' and 'class' attributes are displayed first.
        if (classAttr)
            attrs.splice(0, 0, classAttr);
        if (idAttr)
            attrs.splice(0, 0, idAttr);

        return attrs;
    },

    shortAttrIterator: function(elt)
    {
        // Short version returns only 'id' and 'class' attributes.
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

    copyCSSPath: function(elt)
    {
        var csspath = getElementCSSPath(elt);
        copyToClipboard(csspath);
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

    supportsObject: function(object, type)
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
        return this.getXPath(elt) + " (" + elt.namespaceURI+")";
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
            {label: "CopyXPath", id: "fbCopyXPath", command: bindFixed(this.copyXPath, this, elt) },
            {label: "Copy CSS Path", id: "fbCopyCSSPath", command: bindFixed(this.copyCSSPath, this, elt) },
            "-",
            {label: "ShowEventsInConsole", id: "fbShowEventsInConsole", type: "checkbox", checked: monitored,
             command: bindFixed(toggleMonitorEvents, FBL, elt, null, monitored, context) },
            "-",
            {label: "ScrollIntoView", id: "fbScrollIntoView", command: bindFixed(elt.scrollIntoView, elt) }
        ]);
    }
});

// ************************************************************************************************

FirebugReps.TextNode = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK(
            "&lt;",
            SPAN({"class": "nodeTag"}, "TextNode"),
            "&nbsp;textContent=&quot;",
            SPAN({"class": "nodeValue"}, "$object.textContent|cropMultipleLines"),
            "&quot;",
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

    supportsObject: function(object, type)
    {
        return object instanceof Text;
    },

    getTitle: function(win, context)
    {
        return "textNode";
    }
});

// ************************************************************************************************

var regexpConstructorRE = /RegExp/;
FirebugReps.RegExp = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK(
            SPAN({"class": "objectTitle"}, "$object|getTitle")
        ),

    className: "regexp",

    supportsObject: function(object, type)
    {
        return type == "object" && object && object.constructor && object.constructor.toString &&
            regexpConstructorRE.test(object.constructor.toString());
    }
});

// ************************************************************************************************

FirebugReps.Document = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK("Document ", SPAN({"class": "objectPropValue"}, "$object|getLocation")),

    getLocation: function(doc)
    {
        return doc.location ? getFileName(doc.location.href) : "";
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "object",

    supportsObject: function(object, type)
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

FirebugReps.StyleSheet = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK("StyleSheet ", SPAN({"class": "objectPropValue"}, "$object|getLocation")),

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

    supportsObject: function(object, type)
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

FirebugReps.Window = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK("$object|getWindowTitle ", SPAN({"class": "objectPropValue"}, "$object|getLocation")),

    getLocation: function(win)
    {
        try
        {
            return (win && win.location && !win.closed) ? getFileName(win.location.href) : "";
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("reps.Window window closed? "+exc, exc);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "object",

    supportsObject: function(object, type)
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

    getWindowTitle: function(win)
    {
        if (Firebug.viewChrome)
        {
            if (win.toString().indexOf('XrayWrapper') !== -1)
                return "XrayWrapper[Window]";
        }
        return "Window";
    },

    getTooltip: function(win)
    {
        if (win && !win.closed)
            return win.location.href;
    }
});

// ************************************************************************************************

FirebugReps.Event = domplate(Firebug.Rep,
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

    supportsObject: function(object, type)
    {
        return object instanceof Event || object instanceof EventCopy;
    },

    getTitle: function(event, context)
    {
        return "Event " + event.type;
    }
});

// ************************************************************************************************

FirebugReps.SourceLink = domplate(Firebug.Rep,
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
        try
        {
            return (sourceLink && sourceLink.href && sourceLink.href.indexOf) ?
                (sourceLink.href.indexOf("XPCSafeJSObjectWrapper") != -1) : true;
        }
        catch (e)
        {
            // xxxHonza: I see "Security error" code: "1000" nsresult: "0x805303e8 (NS_ERROR_DOM_SECURITY_ERR)"
            // when accessing globalStorage property of a page.
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("reps.hideSourceLink; EXCEPTION " + sourceLink + ", " + e, e);
        }

        return true;
    },

    getSourceLinkTitle: function(sourceLink)
    {
        if (!sourceLink || !sourceLink.href || typeof(sourceLink.href) !== 'string')
            return "";

        try
        {
            var fileName = getFileName(sourceLink.href);
            fileName = decodeURIComponent(fileName);
        }
        catch(exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("reps.getSourceLinkTitle decodeURIComponent fails for \'"+sourceLink.href+"\': "+exc, exc);
            fileName = sourceLink.href;
        }

        var maxWidth = Firebug.sourceLinkLabelWidth;
        if (maxWidth > 0)
            fileName = cropString(fileName, maxWidth);

        if (sourceLink.instance)
            return $STRF("InstanceLine", [fileName, sourceLink.instance+1, sourceLink.line]);
        else if (sourceLink.line)
            return $STRF("Line", [fileName, sourceLink.line]);
        else
            return fileName;
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

    supportsObject: function(object, type)
    {
        return object instanceof SourceLink;
    },

    getTooltip: function(sourceLink)
    {
        var text;
        try
        {
            text = decodeURI(sourceLink.href);
        }
        catch(exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("reps.getTooltip decodeURI fails for " + sourceLink.href, exc);
        }

        text = unescape(sourceLink.href);

        var lines = splitLines(text);
        if (lines.length < 10)
            return text;

        lines.splice(10);
        return lines.join("") + "...";
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
        else if (sourceLink.type == "net")
        {
            return Firebug.chrome.select(sourceLink);
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

FirebugReps.CompilationUnit = domplate(FirebugReps.SourceLink,
{
    tag:
        OBJECTLINK({$collapsed: "$object|hideSourceLink"}, "$object|getSourceLinkTitle"),

    persistor: function(context, href)
    {
        return context.getCompilationUnit(href);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "CompilationUnit",

    supportsObject: function(object, type)
    {
       return (object instanceof Firebug.ToolsInterface.CompilationUnit) ? 2 : 0;
    },

    persistObject: function(compilationUnit)
    {
        var href = compilationUnit.getURL();
        return bind(this.persistor, top, href);
    },

    browseObject: function(sourceLink, context)
    {
    },

    getTooltip: function(compilationUnit)
    {
        return compilationUnit.getURL();
    }
});

// ************************************************************************************************

FirebugReps.StackFrame = domplate(Firebug.Rep,  // XXXjjb Since the repObject is fn the stack does not have correct line numbers
{
    tag:
        OBJECTBLOCK({$hasTwisty: "$object|hasArguments", _repObject: "$object",
            onclick: "$onToggleArguments"},
            SPAN({"class":"stackFrameMarker"}, ""),
            A({"class": "objectLink a11yFocus", _repObject: "$object"}, "$object|getCallName"),
            SPAN("("),
            SPAN({"class": "arguments"},
                FOR("arg", "$object|argIterator",
                    SPAN({"class": "argName"}, "$arg.name"),
                    SPAN("="),
                    TAG("$arg.tag", {object: "$arg.value"}),
                    SPAN({"class": "arrayComma"}, "$arg.delim")
                )
            ),
            SPAN(")"),
            SPAN({"class": "objectLink-sourceLink objectLink a11yFocus",
                _repObject: "$object|getSourceLink",
                role: "link"},
                "$object|getSourceLinkTitle"),
            DIV({"class": "argList"})
        ),

    argList:
        DIV({"class": "argListBox", onclick: "$onSelectFrame"},
            FOR("arg", "$object|argIterator",
                DIV({"class": "argBox"},
                    SPAN({"class": "argName"}, "$arg.name"),
                    SPAN("&nbsp;=&nbsp;"),
                    TAG("$arg.tag", {object: "$arg.value"})
                )
            )
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getTitle: function(frame)
    {
        return frame.getFunctionName();
    },

    hasArguments: function(frame)
    {
        return frame.args.length;
    },

    getCallName: function(frame)
    {
        return frame.getFunctionName();
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

            if (arg.hasOwnProperty('value')) // then we got these from jsd
            {
                var rep = Firebug.getRep(arg.value);
                var tag = rep.shortTag ? rep.shortTag : rep.tag;

                var delim = (i == frame.args.length-1 ? "" : ", ");

                items.push({name: arg.name, value: arg.value, tag: tag, delim: delim});
            }
            else if (arg.hasOwnProperty('name'))
            {
                items.push({name: arg.name, delim: delim});
            }
            else  // eg from Error object
            {
                var delim = (i == frame.args.length-1 ? "" : ", ");
                var rep = Firebug.getRep(arg);
                var tag = rep.shortTag ? rep.shortTag : rep.tag;

                items.push({value: arg, tag: tag, delim: delim});
            }

            if (FBTrace.DBG_DOMPLATE)
                FBTrace.sysout("reps.stackframe args["+i+"]: "+arg.name+" = "+arg.value, {arg: arg, item: items[items.length - 1]});
        }

        return items;
    },

    getSourceLink: function(stackFrame)
    {
        var sourceLink = new SourceLink(stackFrame.href, stackFrame.line, "js");
        return sourceLink;
    },

    onToggleArguments: function(event)
    {
        this.toggleArguments(event.originalTarget);
    },

    toggleArguments: function(target)
    {
        if (hasClass(target, "objectBox-stackFrame"))
        {
            if (hasClass(target, "opened"))
                this.collapseArguments(target);
            else
                this.expandArguments(target);
        }
    },

    collapseArguments: function(target)
    {
        if (!hasClass(target, "opened"))
            return;

        toggleClass(target, "opened");

        var argList = target.getElementsByClassName("argList").item(0);
        clearNode(argList);
    },

    expandArguments: function(target)
    {
        if (hasClass(target, "opened"))
            return;

        var frame = target.repObject;
        if (!this.hasArguments(frame))
            return;

        toggleClass(target, "opened");

        var argList = target.getElementsByClassName("argList").item(0);
        this.argList.replace({object: frame}, argList);
    },

    onSelectFrame: function(event)
    {
        var target = event.currentTarget;
        if (hasClass(target, "argListBox"))
        {
            var stackFrame = getAncestorByClass(target, "objectBox-stackFrame");
            var panel = Firebug.getElementPanel(target);
            this.inspectObject(stackFrame.repObject, panel.context);
            cancelEvent(event);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Rep

    className: "stackFrame",

    supportsObject: function(object, type)
    {
        return object instanceof StackFrame;
    },

    inspectObject: function(stackFrame, context)
    {
        if (context.stopped)
            Firebug.chrome.select(stackFrame);
        else
            Firebug.chrome.select(this.getSourceLink(stackFrame));
    },

    getTooltip: function(stackFrame, context)
    {
        return $STRF("Line", [stackFrame.href, stackFrame.line]);
    }
});

// ************************************************************************************************

FirebugReps.StackTrace = domplate(Firebug.Rep,
{
    tag:
        DIV({role : "group", 'aria-label' : $STR('aria.labels.stack trace')},
            FOR("frame", "$object.frames",
                TAG(FirebugReps.StackFrame.tag, {object: "$frame"})
            )
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "stackTrace",

    supportsObject: function(object, type)
    {
        return object instanceof StackTrace;
    }
});


FirebugReps.ErrorMessage = domplate(Firebug.Rep,
{
    tag:
        OBJECTBOX({
                $hasTwisty: "$object|hasStackTrace",
                $hasBreakSwitch: "$object|hasBreakSwitch",
                $breakForError: "$object|hasErrorBreak",
                _repObject: "$object",
                _stackTrace: "$object|getLastErrorStackTrace",
                onclick: "$onToggleError"},

            DIV({"class": "errorTitle focusRow subLogRow", role : 'listitem'},
                SPAN({"class": "errorDuplication"}, "$object.msgId|getDuplication"),
                SPAN({"class": "errorMessage"},
                    "$object.message|getMessage"
                )
            ),
            DIV({"class": "errorTrace", role : 'presentation'}),
            TAG("$object|getObjectsTag", {object: "$object.objects"}),
            DIV({"class": "errorSourceBox errorSource-$object|getSourceType focusRow subLogRow", role : "listitem"},
                IMG({"class": "$object|isBreakableError a11yFocus", src:"blank.gif", role : 'checkbox', 'aria-checked':"$object|hasErrorBreak", title: $STR("console.Break On This Error")}),
                A({"class": "errorSource a11yFocus", title: "$object|getSourceTitle"}, "$object|getSource"),
                TAG(FirebugReps.SourceLink.tag, {object: "$object|getSourceLink"})
            )
        ),

    getObjectsTag: function(error)
    {
        return error.objects ? FirebugReps.Arr.tag : SPAN();
    },

    getLastErrorStackTrace: function(error)
    {
        return error.trace;
    },

    hasStackTrace: function(error)
    {
        return error && error.trace;
    },

    hasBreakSwitch: function(error)
    {
        return error.href && error.lineNo > 0;
    },

    isBreakableError: function(error)
    {
        return (error.category === "js") ? 'errorBreak' : 'errorUnbreakable';
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

    getSource: function(error)
    {
        if (error.source)
            return cropString(error.source, 80);
        if (error.category == "js" && error.href && error.href.indexOf("XPCSafeJSObjectWrapper") != -1)
            return "";
        var source = error.getSourceLine();
        if (source)
            return cropString(source, 80);
        return "";
    },

    getSourceTitle: function(error)
    {
      var source = error.getSourceLine();
      if (source)
        return trim(source);
      return "";
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
            return;
        }
        else if (hasClass(event.target, "errorSource"))
        {
            var panel = Firebug.getElementPanel(event.target);
            this.inspectObject(target.repObject, panel.context);
            return;
        }

        var errorTitle = getAncestorByClass(event.target, "errorTitle");
        if (errorTitle)
        {
            var traceBox = target.childNodes[1];
            toggleClass(target, "opened");
            event.target.setAttribute('aria-expanded', hasClass(target, "opened"));

            if (hasClass(target, "opened"))
            {
                if (target.stackTrace)
                    FirebugReps.StackTrace.tag.append({object: target.stackTrace}, traceBox);

                if (Firebug.A11yModel.enabled)
                {
                    var panel = Firebug.getElementPanel(event.target);
                    dispatch(panel.fbListeners, "modifyLogRow", [panel , traceBox]);
                }
            }
            else
            {
                clearNode(traceBox);
            }
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
        copyToClipboard(message.join(lineBreak()));
    },

    breakOnThisError: function(error, context)
    {
        var compilationUnit = context.getCompilationUnit(normalizeURL(error.href));
        if (!compilationUnit)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("reps.breakOnThisError has no source file for error.href: "+error.href+"  error:"+error, context);
            return;
        }

        if (this.hasErrorBreak(error))
            Firebug.Debugger.clearErrorBreakpoint(compilationUnit, error.lineNo);
        else
            Firebug.Debugger.setErrorBreakpoint(compilationUnit, error.lineNo);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "errorMessage",
    inspectable: false,

    supportsObject: function(object, type, context)
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

FirebugReps.Except = domplate(Firebug.Rep,
{
    tag:
        TAG(FirebugReps.ErrorMessage.tag, {object: "$object|getErrorMessage"}),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "exception",

    getTitle: function(object)
    {
        if (object.name)
            return object.name + (object.message ? ": " + object.message : "");
         if (object.message)
            return object.message;
        return "Exception";
    },

    getErrorMessage: function(object)
    {
        var context = Firebug.currentContext,
            win = context.window,
            trace,
            url,
            lineNo,
            errorObject,
            message;

        url = object.fileName ? object.fileName : (win ? win.location.href : "");
        lineNo = object.lineNumber ? object.lineNumber : 0;
        message = this.getTitle(object);

        if (object.stack)
        {
            trace = FBL.parseToStackTrace(object.stack, context);
            trace = cleanStackTraceOfFirebug(trace);
            if (!trace)
                lineNo = 0;
        }
        errorObject = new FBL.ErrorMessage(message, url, lineNo, '', 'js',
            context, trace);

        if (trace && trace.frames && trace.frames[0])
            errorObject.correctWithStackTrace(trace);
        errorObject.resetSource();

        return errorObject;
    },

    supportsObject: function(object, type, context)
    {
        var win = context ? FBL.getContentView(context.window) : null;
        var found = (win && instanceOf(object, win.Error)) || (object instanceof ErrorCopy) ||
            (object.constructor && object.constructor.name == "ReferenceError");
        return found;
    }
});

// ************************************************************************************************

FirebugReps.Assert = domplate(Firebug.Rep,
{
    tag:
        DIV(
            DIV({"class": "errorTitle"}),
            DIV({"class": "assertDescription"})
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

FirebugReps.SourceText = domplate(Firebug.Rep,
{
    tag:
        DIV(
            FOR("line", "$object|lineIterator",
                DIV({"class": "sourceRow", role : "presentation"},
                    SPAN({"class": "sourceLine", role : "presentation"}, "$line.lineNo"),
                    SPAN({"class": "sourceRowText", role : "presentation"}, "$line.text")
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

FirebugReps.nsIDOMHistory = domplate(Firebug.Rep,
{
    tag:
        OBJECTBOX({onclick: "$showHistory", _repObject: "$object"},
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

    showHistory: function(event)
    {
        try
        {
            var history = event.currentTarget.repObject;
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

FirebugReps.ApplicationCache = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK("$object|summarizeCache"),

    summarizeCache: function(applicationCache)
    {
        try
        {
            return applicationCache.mozItems.length + " items in offline cache";
        }
        catch(exc)
        {
            return "https://bugzilla.mozilla.org/show_bug.cgi?id=422264";
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "applicationCache",

    supportsObject: function(object, type)
    {
        if (Ci.nsIDOMOfflineResourceList)
            return (object instanceof Ci.nsIDOMOfflineResourceList);
    }
});

// ************************************************************************************************

FirebugReps.Storage = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK(
            SPAN({"class": "storageTitle"}, "$object|summarize "),
            FOR("prop", "$object|longPropIterator",
                "$prop.name",
                SPAN({"class": "objectEqual", role: "presentation"}, "$prop.equal"),
                TAG("$prop.tag", {object: "$prop.object"}),
                SPAN({"class": "objectComma", role: "presentation"}, "$prop.delim")
            )
        ),

    shortTag:
        OBJECTLINK(
            SPAN({"class": "storageTitle"}, "$object|summarize "),
            FOR("prop", "$object|shortPropIterator",
                "$prop.name",
                SPAN({"class": "objectEqual", role: "presentation"}, "$prop.equal"),
                TAG("$prop.tag", {object: "$prop.object"}),
                SPAN({"class": "objectComma", role: "presentation"}, "$prop.delim")
            )
        ),

    summarize: function(storage)
    {
        return $STRP("firebug.storage.totalItems", [storage.length]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "Storage",

    supportsObject: function(object, type)
    {
        return (object instanceof Storage);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Iterator

    longPropIterator: function(object)
    {
        return this.propIterator(object, 100);
    },

    shortPropIterator: function(object)
    {
        return this.propIterator(object, Firebug.ObjectShortIteratorMax);
    },

    propIterator: function(object, max)
    {
        // we can't utilize the existing function due to:
        // https://bugzilla.mozilla.org/show_bug.cgi?id=573875
        //return FirebugReps.Obj.propIterator(object, max);

        max = max || 3;
        if (!object)
            return [];

        var props = [];
        var len = 0, count = 0;

        try
        {
            for (var i=0; i<object.length; i++)
            {
                var value;
                var name;
                try
                {
                    name = object.key(i);
                    value = object.getItem(name);
                    if (value instanceof StorageItem)
                        value = value.value;
                }
                catch (exc)
                {
                    continue;
                }

                var rep = Firebug.getRep(value);
                var tag = rep.shortTag || rep.tag;

                count++;
                if (count <= max)
                    props.push({tag: tag, name: name, object: value, equal: "=", delim: ", "});
                else
                    break;
            }

            if (count > max)
            {
                props[Math.max(1,max-1)] = {
                    object: $STR("firebug.reps.more") + "...",
                    tag: FirebugReps.Caption.tag,
                    name: "",
                    equal:"",
                    delim:""
                };
            }
            else if (props.length > 0)
            {
                props[props.length-1].delim = '';
            }
        }
        catch (exc)
        {
        }
        return props;
    },
});

// ************************************************************************************************

FirebugReps.StorageList = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK(
            SPAN({"class": "storageTitle"}, "$object|summarize "),
            FOR("prop", "$object|longPropIterator",
                "$prop.name",
                SPAN({"class": "objectEqual", role: "presentation"}, "$prop.equal"),
                TAG("$prop.tag", {object: "$prop.object"}),
                SPAN({"class": "objectComma", role: "presentation"}, "$prop.delim")
            )
        ),

    shortTag:
        OBJECTLINK({onclick: "$onClick"},
            SPAN({"class": "storageTitle"}, "$object|summarize "),
            FOR("prop", "$object|shortPropIterator",
                "$prop.name",
                SPAN({"class": "objectEqual", role: "presentation"}, "$prop.equal"),
                TAG("$prop.tag", {object: "$prop.object"}),
                SPAN({"class": "objectComma", role: "presentation"}, "$prop.delim")
            )
        ),

    onClick: function(event)
    {
        var globalStorage = event.currentTarget.repObject;
        var context = Firebug.currentContext;
        var domain = context.window.location.hostname;

        Firebug.chrome.select(globalStorage.namedItem(domain));
        cancelEvent(event);
    },

    summarize: function(globalStorage)
    {
        try
        {
            var context = Firebug.currentContext;
            var domain = context.window.location.hostname;
            var length = globalStorage.namedItem(domain).length;
            return $STRP("firebug.storage.totalItems", [length]) + " ";
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("reps.StorageList.summarize; EXCEPTION " + e, e);
        }
        return "";
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "StorageList",

    supportsObject: function(object, type)
    {
        return (object instanceof StorageList);
    },

    getRealObject: function(object, context)
    {
        try
        {
            var domain = context.window.location.hostname;
            return globalStorage.namedItem(domain);
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("reps.StorageList.getRealObject; EXCEPTION " + e, e);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Iterator

    longPropIterator: function(object)
    {
        return this.propIterator(object, 100);
    },

    shortPropIterator: function(object)
    {
        return this.propIterator(object, Firebug.ObjectShortIteratorMax);
    },

    propIterator: function(object, max)
    {
        try
        {
            var context = Firebug.currentContext;
            var domain = context.window.location.hostname;
            return FirebugReps.Storage.propIterator(object.namedItem(domain), max);
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("reps.StorageList.propIterator; EXCEPTION " + e, e);
        }
        return [];
    },
});

// ************************************************************************************************

FirebugReps.XPathResult = domplate(FirebugReps.Arr,
{
    className: "array xPathResult",
    toggles: new ToggleBranch(),

    tag:
        SPAN(FirebugReps.Arr.tag),

    shortTag:
        SPAN(FirebugReps.Arr.shortTag),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    supportsObject: function(xpathresult, type)
    {
        return (xpathresult instanceof XPathResult);
    },

    arrayIterator: function(xpathresult, max)
    {
        var items = [];
        for (var i=0; i<xpathresult.snapshotLength && i<=max; i++)
        {
            var value = xpathresult.snapshotItem(i);
            var rep = Firebug.getRep(value);
            var tag = rep.shortTag || rep.tag;
            var delim = (i == xpathresult.snapshotLength-1 ? "" : ", ");

            items.push({object: value, tag: tag, delim: delim});
        }

        if (xpathresult.snapshotLength > max + 1)
        {
            items[max] = {
                object: (xpathresult.snapshotLength-max) + " " + $STR("firebug.reps.more") + "...",
                tag: FirebugReps.Caption.tag,
                delim: ""
            };
        }

        return items;
    },
});

// ************************************************************************************************

FirebugReps.Description = domplate(Firebug.Rep,
{
    className: "Description",

    tag:
        DIV({onclick: "$onClickLink"}),

    render: function(text, parentNode, listener)
    {
        var params = {};
        if (listener)
        {
            params.onClickLink = function(event)
            {
                // Only clicks on links are passed to the original listener.
                var localName = event.target.localName;
                if (listener && localName && localName.toLowerCase() == "a")
                    listener(event);
            };
        }

        var rootNode = this.tag.replace(params, parentNode, this);

        var parser = CCIN("@mozilla.org/xmlextras/domparser;1", "nsIDOMParser");
        var doc = parser.parseFromString("<div>" + text + "</div>", "text/xml");
        var root = doc.documentElement;

        // Error handling
        var nsURI = "http://www.mozilla.org/newlayout/xml/parsererror.xml";
        if (root.namespaceURI == nsURI && root.nodeName == "parsererror")
        {
            FBTrace.sysout("reps.Description; parse ERROR " + root.firstChild.nodeValue, root);

            return FirebugReps.Warning.tag.replace({object: "css.EmptyElementCSS"},
                parentNode, FirebugReps.Warning);
        }

        // Nodes from external documents need to be imported.
        root = rootNode.ownerDocument.importNode(root, true);

        rootNode.appendChild(root);
        return rootNode;
    }
});

// ************************************************************************************************

FirebugReps.Attr = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK(
            SPAN(
                SPAN({"class": "attrTitle"}, "$object|getTitle"),
                SPAN({"class": "attrEqual"}, "="),
                TAG("$object|getValueTag", {object: "$object.nodeValue"})
            )
        ),

    getTitle: function(attr)
    {
        return attr.nodeName;
    },

    getValueTag: function(object)
    {
        return Firebug.getRep(object.nodeValue).tag;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "Attr",

    supportsObject: function(object, type)
    {
        return (object instanceof Attr);
    },
});

// ********************************************************************************************* //

FirebugReps.Date = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK(
            SPAN({"class": "objectTitle"}, "$object|getTitle "),
            SPAN({"class": "objectLeftBrace", role: "presentation"}, "{"),
            SPAN({"class": "attrEqual"}, "$object|getValue"),
            SPAN({"class": "objectRightBrace"}, "}")
        ),

    getValue: function(object)
    {
        return object.toString();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    className: "Date",

    supportsObject: function(object, type)
    {
        return object && object.constructor && object.constructor.name == "Date";
    },
});

// ********************************************************************************************* //

FirebugReps.NamedNodeMap = domplate(Firebug.Rep,
{
    tag:
        OBJECTLINK(
            SPAN({"class": "arrayLeftBracket", role: "presentation"}, "["),
            FOR("prop", "$object|longPropIterator",
                SPAN({"class": "nodeName"}, "$prop.name"),
                SPAN({"class": "objectEqual", role: "presentation"}, "$prop.equal"),
                TAG("$prop.tag", {object: "$prop.object"}),
                SPAN({"class": "objectComma", role: "presentation"}, "$prop.delim")
            ),
            SPAN({"class": "arrayRightBracket", role: "presentation"}, "]")
        ),

    shortTag:
        OBJECTLINK({onclick: "$onClick"},
            SPAN({"class": "arrayLeftBracket", role: "presentation"}, "["),
            FOR("prop", "$object|shortPropIterator",
                SPAN({"class": "nodeName"}, "$prop.name"),
                SPAN({"class": "objectEqual", role: "presentation"}, "$prop.equal"),
                TAG("$prop.tag", {object: "$prop.object"}),
                SPAN({"class": "objectComma", role: "presentation"}, "$prop.delim")
            ),
            SPAN({"class": "arrayRightBracket", role: "presentation"}, "]")
        ),

    onClick: function(event)
    {
        var globalStorage = event.currentTarget.repObject;
        var context = Firebug.currentContext;
        var domain = context.window.location.hostname;

        Firebug.chrome.select(globalStorage.namedItem(domain));
        cancelEvent(event);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "NamedNodeMap",

    supportsObject: function(object, type)
    {
        return (object instanceof NamedNodeMap);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Iterator

    longPropIterator: function(object)
    {
        return this.propIterator(object, 100);
    },

    shortPropIterator: function(object)
    {
        return this.propIterator(object, Firebug.ObjectShortIteratorMax);
    },

    propIterator: function (object, max)
    {
        max = max || 3;
        if (!object)
            return [];

        var props = [];
        for (var i=0; i<object.length && i<max; i++)
        {
            var item = object.item(i);
            var name = item.nodeName;
            var value = item.nodeValue;

            var rep = Firebug.getRep(value);
            tag = rep.tag;

            props.push({tag: tag, name: name, object: value, equal: "=", delim: ", "});
        }

        if (object.length > max)
        {
            props[Math.max(1,max-1)] = {
                object: (object.length-max) + " " + $STR("firebug.reps.more") + "...",
                tag: FirebugReps.Caption.tag,
                name: "",
                equal:"",
                delim:""
            };
        }
        else if (props.length > 0)
        {
            props[props.length-1].delim = '';
        }

        return props;
    },
});

// ************************************************************************************************

Firebug.registerRep(
    FirebugReps.nsIDOMHistory, // make this early to avoid exceptions
    FirebugReps.Undefined,
    FirebugReps.Null,
    FirebugReps.Number,
    FirebugReps.RegExp,
    FirebugReps.String,
    FirebugReps.Window,
    FirebugReps.ApplicationCache, // must come before Arr (array) else exceptions.
    FirebugReps.ErrorMessage,
    FirebugReps.Element,
    FirebugReps.TextNode,
    FirebugReps.Document,
    FirebugReps.StyleSheet,
    FirebugReps.Event,
    FirebugReps.SourceLink,
    FirebugReps.CompilationUnit,
    FirebugReps.StackTrace,
    FirebugReps.StackFrame,
    FirebugReps.NetFile,
    FirebugReps.Property,
    FirebugReps.Except,
    FirebugReps.XML,
    FirebugReps.Arr,
    FirebugReps.XPathResult,
    FirebugReps.Storage,
    FirebugReps.StorageList,
    FirebugReps.Attr,
    FirebugReps.Date,
    FirebugReps.NamedNodeMap
);

Firebug.setDefaultReps(FirebugReps.Func, FirebugReps.Obj);

return FirebugReps;
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
