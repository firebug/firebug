/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/css",
    "firebug/lib/events",
    "firebug/lib/object",
    "firebug/lib/options",
    "firebug/lib/xpcom",
    "firebug/chrome/module",
    "firebug/css/cssDirtyListener",
    "firebug/editor/editorSelector"
],
function(Firebug, Css, Events, Obj, Options, Xpcom, Module, CSSDirtyListener, EditorSelector) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var reSplitCSS = /(url\((".*?"\)|".*|[^)]*\)?))|(rgba?\([^)]*\)?)|(#[\dA-Fa-f]+)|(hsla?\([^)]*\)?)|(-?\d+(\.\d+)?(%|[a-z]{1,4})?)|"([^"]*)"?|'([^']*)'?|([^,\s\/!\(\)]+)|(!(.*)?)/;
var reURL = /url\((")?(.*)?\1\)/;
var reRepeat = /no-repeat|repeat-x|repeat-y|repeat/;

// ********************************************************************************************* //
// CSS Module

Firebug.CSSModule = Obj.extend(Module, Firebug.EditorSelector,
{
    dispatchName: "cssModule",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        this.editors = {};
        this.registerEditor("Live",
        {
            startEditing: function(stylesheet, context, panel)
            {
                panel.startLiveEditing(stylesheet, context);
            },
            stopEditing: function()
            {
                Firebug.Editor.stopEditing();
            }
        });

        this.registerEditor("Source",
        {
            startEditing: function(stylesheet, context, panel)
            {
                panel.startSourceEditing(stylesheet, context);
            },
            stopEditing: function()
            {
                Firebug.Editor.stopEditing();
            }
        });
    },

    initContext: function(context)
    {
        context.dirtyListener = new CSSDirtyListener(context);
        this.addListener(context.dirtyListener);
    },

    destroyContext: function(context)
    {
        this.removeListener(context.dirtyListener);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    freeEdit: function(styleSheet, value)
    {
        if (FBTrace.DBG_CSS)
            FBTrace.sysout("CSSModule.freeEdit", arguments);

        if (!styleSheet.editStyleSheet)
        {
            var ownerNode = getStyleSheetOwnerNode(styleSheet);
            styleSheet.disabled = true;

            var url = Xpcom.CCSV("@mozilla.org/network/standard-url;1", Ci.nsIURL);
            url.spec = styleSheet.href;

            var editStyleSheet = ownerNode.ownerDocument.createElementNS(
                "http://www.w3.org/1999/xhtml",
                "style");

            Firebug.setIgnored(editStyleSheet);

            editStyleSheet.setAttribute("type", "text/css");
            editStyleSheet.setAttributeNS(
                "http://www.w3.org/XML/1998/namespace",
                "base",
                url.directory);

            if (ownerNode.hasAttribute("media"))
                editStyleSheet.setAttribute("media", ownerNode.getAttribute("media"));

            // Insert the edited stylesheet directly after the old one to ensure the styles
            // cascade properly.
            ownerNode.parentNode.insertBefore(editStyleSheet, ownerNode.nextSibling);

            styleSheet.editStyleSheet = editStyleSheet;
        }

        styleSheet.editStyleSheet.textContent = value;

        if (FBTrace.DBG_CSS)
            FBTrace.sysout("css.saveEdit styleSheet.href:" + styleSheet.href +
                " got innerHTML:" + value);

        Events.dispatch(this.fbListeners, "onCSSFreeEdit", [styleSheet, value]);
    },

    insertRule: function(styleSheet, cssText, ruleIndex)
    {
        if (FBTrace.DBG_CSS)
            FBTrace.sysout("Insert: " + ruleIndex + " " + cssText);

        var insertIndex = styleSheet.insertRule(cssText, ruleIndex);

        Events.dispatch(this.fbListeners, "onCSSInsertRule", [styleSheet, cssText, ruleIndex]);

        return insertIndex;
    },

    deleteRule: function(src, ruleIndex)
    {
        var inlineStyle = (src instanceof window.Element);
        if (FBTrace.DBG_CSS)
        {
            if (inlineStyle)
            {
                FBTrace.sysout("deleteRule: element.style", src);
            }
            else
            {
                FBTrace.sysout("deleteRule: " + ruleIndex + " " + src.cssRules.length,
                    src.cssRules);
            }
        }

        var rule = (inlineStyle ? src : src.cssRules[ruleIndex]);
        var afterParams = [src, rule.style.cssText];
        afterParams.push(inlineStyle ? "" : rule.selectorText);

        Events.dispatch(this.fbListeners, "onCSSDeleteRule", [src, ruleIndex]);

        if (src instanceof window.Element)
            src.removeAttribute("style");
        else
            src.deleteRule(ruleIndex);

        Events.dispatch(this.fbListeners, "onAfterCSSDeleteRule", afterParams);
    },

    setProperty: function(rule, propName, propValue, propPriority)
    {
        var style = rule.style || rule;

        // Record the original CSS text for the inline case so we can reconstruct at a later
        // point for diffing purposes
        var baseText = style.cssText;

        var prevValue = style.getPropertyValue(propName);
        var prevPriority = style.getPropertyPriority(propName);

        // XXXjoe Gecko bug workaround: Just changing priority doesn't have any effect
        // unless we remove the property first
        style.removeProperty(propName);

        style.setProperty(propName, propValue, propPriority);

        if (propName)
        {
            Events.dispatch(this.fbListeners, "onCSSSetProperty", [style, propName, propValue,
                propPriority, prevValue, prevPriority, rule, baseText]);
        }
    },

    removeProperty: function(rule, propName, parent)
    {
        var style = rule.style || rule;

        // Record the original CSS text for the inline case so we can reconstruct at a later
        // point for diffing purposes
        var baseText = style.cssText;

        var prevValue = style.getPropertyValue(propName);
        var prevPriority = style.getPropertyPriority(propName);

        style.removeProperty(propName);

        if (propName)
            Events.dispatch(this.fbListeners, "onCSSRemoveProperty", [style, propName, prevValue,
                prevPriority, rule, baseText]);
    },

    /**
     * Method for atomic property removal, such as through the context menu.
     */
    deleteProperty: function(rule, propName, context)
    {
        Events.dispatch(this.fbListeners, "onBeginFirebugChange", [rule, context]);
        Firebug.CSSModule.removeProperty(rule, propName);
        Events.dispatch(this.fbListeners, "onEndFirebugChange", [rule, context]);
    },

    disableProperty: function(disable, rule, propName, parsedValue, map, context)
    {
        Events.dispatch(this.fbListeners, "onBeginFirebugChange", [rule, context]);

        if (disable)
        {
            Firebug.CSSModule.removeProperty(rule, propName);

            map.push({"name": propName, "value": parsedValue.value,
                "important": parsedValue.priority});
        }
        else
        {
            Firebug.CSSModule.setProperty(rule, propName, parsedValue.value, parsedValue.priority);

            var index = findPropByName(map, propName);
            map.splice(index, 1);
        }

        Events.dispatch(this.fbListeners, "onEndFirebugChange", [rule, context]);
    },

    /**
     * Get a document's temporary stylesheet for storage of user-provided rules.
     * If it doesn't exist yet, create it.
     */
    getDefaultStyleSheet: function(doc)
    {
        // Cache the temporary sheet on an expando of the document.
        var sheet = doc.fbDefaultSheet;
        if (!sheet)
        {
            sheet = Css.appendStylesheet(doc, "chrome://firebug/default-stylesheet.css").sheet;
            sheet.defaultStylesheet = true;
            doc.fbDefaultSheet = sheet;
        }
        return sheet;
    },

    parseCSSValue: function(value, offset)
    {
        var start = 0;
        var m;
        while (true)
        {
            m = reSplitCSS.exec(value);
            if (!m || m.index + m[0].length >= offset)
                break;

            value = value.substr(m.index + m[0].length);
            start += m.index + m[0].length;
            offset -= m.index + m[0].length;
        }

        if (!m)
            return;

        var type;
        if (m[1])
            type = "url";
        else if (m[3] || m[4])
            type = "rgb";
        else if (m[5])
            type = "hsl";
        else if (m[6])
            type = "int";

        var cssValue = {
            value: m[0],
            start: start + m.index,
            end: start + m.index + m[0].length,
            type: type
        };

        if (!type)
        {
            if (m[11] && m[11].contains("gradient"))
            {
                var arg = value.substr(m[0].length).match(/\((?:(?:[^\(\)]*)|(?:\(.*?\)))+\)/);
                if (!arg)
                  return;

                cssValue.value += arg[0];
                cssValue.type = "gradient";
            }
            else if (Css.isColorKeyword(cssValue.value))
            {
                cssValue.type = "colorKeyword";
            }
        }

        return cssValue;
    },

    parseCSSFontFamilyValue: function(value, offset, propName)
    {
        var skipped = 0;
        if (propName === "font")
        {
            var rePreFont = new RegExp(
                "^.*" + // anything, then
                "(" +
                    "\\d+(\\.\\d+)?([a-z]*|%)|" + // a number (with possible unit)
                    "(x{1,2}-)?(small|large)|medium|larger|smaller" + // or an named size description
                ") "
            );
            var m = rePreFont.exec(value);
            if (!m || offset < m[0].length)
                return this.parseCSSValue(value, offset);
            skipped = m[0].length;
            value = value.substr(skipped);
            offset -= skipped;
        }

        var matches = /^(.*?)(\s*!.*)?$/.exec(value);
        var fonts = matches[1].split(",");

        var totalLength = 0;
        for (var i = 0; i < fonts.length; ++i)
        {
            totalLength += fonts[i].length;
            if (offset <= totalLength)
            {
                // Give back the value and location of this font, whitespace-trimmed.
                var font = fonts[i].replace(/^\s+/, "");
                var end = totalLength;
                var start = end - font.length;
                return {
                    value: font,
                    start: start + skipped,
                    end: end + skipped,
                    type: "fontFamily"
                };
            }

            // include ","
            ++totalLength;
        }

        // Parse !important.
        var ret = this.parseCSSValue(value, offset);
        if (ret)
        {
            ret.start += skipped;
            ret.end += skipped;
        }
        return ret;
    },

    parsePriority: function(value)
    {
        var rePriority = /(.*?)\s*(!important)?$/;
        var m = rePriority.exec(value);
        var propValue = m ? m[1] : "";
        var priority = m && m[2] ? "important" : "";
        return {value: propValue, priority: priority};
    },

    parseURLValue: function(value)
    {
        var m = reURL.exec(value);
        // URLs can contain characters like a single quote, which are escaped,
        // so we need to strip the backslash in order to get the valid URL
        return m ? m[2].replace("\\", "") : "";
    },

    parseRepeatValue: function(value)
    {
        var m = reRepeat.exec(value);
        return m ? m[0] : "";
    },

    getPropertyInfo: function(computedStyle, propName)
    {
        var propInfo = {
            property: propName,
            value: computedStyle.getPropertyValue(propName),
            matchedSelectors: [],
            matchedRuleCount: 0
        };

        return propInfo;
    },

    getColorDisplayOptionMenuItems: function()
    {
        return [
            "-",
            {
                label: "computed.option.label.Colors_As_Authored",
                tooltiptext: "computed.option.tip.Colors_As_Authored",
                type: "radio",
                name: "colorDisplay",
                id: "colorDisplayAuthored",
                command: function() {
                    return Options.set("colorDisplay", "authored");
                },
                checked: Options.get("colorDisplay") == "authored"
            },
            {
                label: "computed.option.label.Colors_As_Hex",
                tooltiptext: "computed.option.tip.Colors_As_Hex",
                type: "radio",
                name: "colorDisplay",
                id: "colorDisplayHex",
                command: function() {
                    return Options.set("colorDisplay", "hex");
                },
                checked: Options.get("colorDisplay") == "hex"
            },
            {
                label: "computed.option.label.Colors_As_RGB",
                tooltiptext: "computed.option.tip.Colors_As_RGB",
                type: "radio",
                name: "colorDisplay",
                id: "colorDisplayRGB",
                command: function() {
                    return Options.set("colorDisplay", "rgb");
                },
                checked: Options.get("colorDisplay") == "rgb"
            },
            {
                label: "computed.option.label.Colors_As_HSL",
                tooltiptext: "computed.option.tip.Colors_As_HSL",
                type: "radio",
                name: "colorDisplay",
                id: "colorDisplayHSL",
                command: function() {
                    return Options.set("colorDisplay", "hsl");
                },
                checked: Options.get("colorDisplay") == "hsl"
            }
        ];
    },
});

// ********************************************************************************************* //
// Helpers

function getStyleSheetOwnerNode(sheet)
{
    for (; sheet && !sheet.ownerNode; sheet = sheet.parentStyleSheet);

    return sheet.ownerNode;
}

function findPropByName(props, name)
{
    for (var i = 0; i < props.length; ++i)
    {
        if (props[i].name == name)
            return i;
    }
}

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.CSSModule);

return Firebug.CSSModule;

// ********************************************************************************************* //
});
