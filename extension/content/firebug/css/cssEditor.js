/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/domplate",
    "firebug/lib/events",
    "firebug/lib/xml",
    "firebug/css/autoCompleter",
    "firebug/css/cssModule",
    "firebug/css/cssReps",
    "firebug/editor/inlineEditor",
],
function(Firebug, FBTrace, Css, Dom, Domplate, Events, Xml, CSSAutoCompleter, CSSModule, CSSReps,
    InlineEditor) {

// ********************************************************************************************* //
// Constants

var {domplate} = Domplate;

// ********************************************************************************************* //
// CSSEditor

function CSSEditor(doc)
{
    this.initializeInline(doc);
}

CSSEditor.prototype = domplate(InlineEditor.prototype,
{
    insertNewRow: function(target, insertWhere)
    {
        var rule = Firebug.getRepObject(target);
        if (!rule)
        {
            if (FBTrace.DBG_CSS)
                FBTrace.sysout("CSSEditor.insertNewRow; ERROR There is no CSS rule", target);
            return;
        }

        var emptyProp = {name: "", value: "", important: ""};

        if (insertWhere == "before")
            return CSSReps.CSSPropTag.tag.insertBefore({prop: emptyProp, rule: rule}, target);
        else
            return CSSReps.CSSPropTag.tag.insertAfter({prop: emptyProp, rule: rule}, target);
    },

    saveEdit: function(target, value, previousValue)
    {
        if (FBTrace.DBG_CSS)
            FBTrace.sysout("CSSEditor.saveEdit", arguments);

        var cssRule = Dom.getAncestorByClass(target, "cssRule");
        var rule = Firebug.getRepObject(cssRule);

        if (rule instanceof window.CSSStyleRule ||
                (rule instanceof (window.CSSKeyframeRule || window.MozCSSKeyframeRule)) &&
                !Css.hasClass(target, "cssKeyText") ||
            rule instanceof window.Element)
        {
            var prop = Dom.getAncestorByClass(target, "cssProp");

            if (prop)
            {
                var propName = Dom.getChildByClass(prop, "cssPropName").textContent;
                // If the property was previously disabled, remove it from the "disabled"
                // map. (We will then proceed to enable the property.)
                if (prop && prop.classList.contains("disabledStyle"))
                {
                    prop.classList.remove("disabledStyle");

                    this.panel.removeDisabledProperty(rule, propName);
                }

                if (Css.hasClass(target, "cssPropName"))
                {
                    // Actual saving is done in endEditing, see the comment there.
                    target.textContent = value;
                }
                else if (Dom.getAncestorByClass(target, "cssPropValue"))
                {
                    target.textContent = CSSReps.CSSDomplateBase.getPropertyValue({value: value});

                    propName = Dom.getChildByClass(prop, "cssPropName").textContent;

                    if (FBTrace.DBG_CSS)
                    {
                        FBTrace.sysout("CSSEditor.saveEdit \"" + propName + "\" = \"" +
                            value + "\"");
                       // FBTrace.sysout("CSSEditor.saveEdit BEFORE style:",style);
                    }

                    if (value && value != "null")
                    {
                        var parsedValue = CSSModule.parsePriority(value);
                        CSSModule.setProperty(rule, propName, parsedValue.value,
                            parsedValue.priority);
                    }
                    else if (previousValue && previousValue != "null")
                    {
                        CSSModule.removeProperty(rule, propName);
                    }
                }

                if (value)
                {
                    var saveSuccess = false;
                    if (Css.hasClass(target, "cssPropName"))
                    {
                        var propName = value.replace(/-./g, function(match)
                        {
                            return match[1].toUpperCase();
                        });

                        if (propName in rule.style || propName == "float")
                            saveSuccess = "almost";
                    }
                    else
                    {
                        saveSuccess = !!rule.style.getPropertyValue(propName);
                    }

                    this.box.setAttribute("saveSuccess", saveSuccess);
                }
                else
                {
                    this.box.removeAttribute("saveSuccess");
                }
            }
        }
        else if (window.CSSSupportsRule && rule instanceof window.CSSSupportsRule &&
            Css.hasClass(target, "cssSupportsRuleCondition"))
        {
            target.textContent = value;

            if (FBTrace.DBG_CSS)
            {
                FBTrace.sysout("CSSEditor.saveEdit: @supports rule condition: " +
                    previousValue + "->" + value);
            }

            try
            {
                rule.conditionText = value;
            }
            catch (e)
            {
            }

            var saveSuccess = (rule.conditionText == value);
            this.box.setAttribute("saveSuccess", saveSuccess);
        }
        else if (((window.CSSKeyframesRule && rule instanceof window.CSSKeyframesRule) ||
            rule instanceof window.MozCSSKeyframesRule))
        {
            target.textContent = value;

            if (FBTrace.DBG_CSS)
            {
                FBTrace.sysout("CSSEditor.saveEdit: @keyframes rule name: " +
                    previousValue + "->" + value);
            }

            rule.name = value;

            var saveSuccess = (rule.name == value);
            this.box.setAttribute("saveSuccess", saveSuccess);
        }
        else if (((window.CSSKeyframeRule && rule instanceof window.CSSKeyframeRule) ||
            rule instanceof window.MozCSSKeyframeRule) &&
            Css.hasClass(target, "cssKeyText"))
        {
            target.textContent = value;

            if (FBTrace.DBG_CSS)
            {
                FBTrace.sysout("CSSEditor.saveEdit: @keyframe rule key: " +
                    previousValue + "->" + value);
            }

            rule.keyText = value;

            var saveSuccess = (rule.keyText == value || rule.keyText == Css.keyframeKeys[value]);
            this.box.setAttribute("saveSuccess", saveSuccess);
        }
        else if (rule instanceof window.CSSMozDocumentRule &&
                Css.hasClass(target, "cssDocumentRuleCondition"))
        {
            target.textContent = value;

            if (FBTrace.DBG_CSS)
            {
                FBTrace.sysout("CSSEditor.saveEdit: @-moz-document rule condition: " +
                        previousValue + "->" + value);
            }

            try
            {
                rule.conditionText = value;
            }
            catch (e)
            {
            }

            var saveSuccess = (rule.conditionText == value);
            this.box.setAttribute("saveSuccess", saveSuccess);
        }
        else if (rule instanceof window.CSSImportRule && Css.hasClass(target, "cssMediaQuery"))
        {
            target.textContent = value;

            if (FBTrace.DBG_CSS)
            {
                FBTrace.sysout("CSSEditor.saveEdit: @import media query: " +
                    previousValue + "->" + value);
            }

            rule.media.mediaText = value;

            // Workaround to apply the media query changes
            rule.parentStyleSheet.disabled = true;
            rule.parentStyleSheet.disabled = false;

            var row = Dom.getAncestorByClass(target, "importRule");
            row.getElementsByClassName("separator").item(0).textContent =
                value == "" ? "" : String.fromCharCode(160);

            var saveSuccess = rule.media.mediaText != "not all" || value == "not all";
            this.box.setAttribute("saveSuccess", saveSuccess);
        }
        else if (rule instanceof window.CSSMediaRule &&
            Css.hasClass(target, "cssMediaRuleCondition"))
        {
            target.textContent = value;

            if (FBTrace.DBG_CSS)
            {
                FBTrace.sysout("CSSEditor.saveEdit: @media rule condition: " +
                    previousValue + "->" + value);
            }

            rule.conditionText = value;

            var saveSuccess = (rule.conditionText == value);
            this.box.setAttribute("saveSuccess", saveSuccess);
        }
        else if (rule instanceof window.CSSCharsetRule)
        {
            target.textContent = value;

            if (FBTrace.DBG_CSS)
                FBTrace.sysout("CSSEditor.saveEdit: @charset: " + previousValue + "->" + value);

            rule.encoding = value;
        }

        Firebug.Inspector.repaint();

        this.panel.markChange(this.panel.name == "stylesheet");

        if (FBTrace.DBG_CSS)
            FBTrace.sysout("CSSEditor.saveEdit (ending) " + this.panel.name, value);
    },

    beginEditing: function(target, value)
    {
        var row = Dom.getAncestorByClass(target, "cssProp");
        this.initialValue = value;
        this.initiallyDisabled = (row && row.classList.contains("disabledStyle"));
    },

    endEditing: function(target, value, cancel)
    {
        if (!cancel && target.classList.contains("cssPropName"))
        {
            // Save changed property names here instead of in saveEdit, because otherwise
            // unrelated properties might get discarded (see issue 5204).
            var previous = this.initialValue;
            if (FBTrace.DBG_CSS)
            {
                FBTrace.sysout("CSSEditor.endEditing: renaming property " + previous + " -> " +
                    value);
            }

            var cssRule = Dom.getAncestorByClass(target, "cssRule");
            var rule = Firebug.getRepObject(cssRule);
            var baseText = rule.style ? rule.style.cssText : rule.cssText;
            var prop = Dom.getAncestorByClass(target, "cssProp");
            var propValue = Dom.getChildByClass(prop, "cssPropValue").textContent;
            var parsedValue = CSSModule.parsePriority(propValue);

            if (previous)
                CSSModule.removeProperty(rule, previous);
            if (propValue)
                CSSModule.setProperty(rule, value, parsedValue.value, parsedValue.priority);

            Events.dispatch(CSSModule.fbListeners, "onCSSPropertyNameChanged", [rule, value,
                    previous, baseText]);

            Firebug.Inspector.repaint();
            this.panel.markChange(this.panel.name == "stylesheet");
        }
        return true;
    },

    cancelEditing: function(target, value)
    {
        if (this.initiallyDisabled)
        {
            // Disable the property again.
            var row = Dom.getAncestorByClass(target, "cssProp");
            if (row && !row.classList.contains("disabledStyle"))
                this.panel.disablePropertyRow(row);
        }
    },

    advanceToNext: function(target, charCode)
    {
        if (charCode == 58 /*":"*/ && Css.hasClass(target, "cssPropName"))
        {
            return true;
        }
        else if (charCode == 59 /*";"*/ && Css.hasClass(target, "cssPropValue"))
        {
            var cssValue = CSSModule.parseCSSValue(this.input.value, this.input.selectionStart);
            // Simple test, if we are inside a string (see issue 4543)
            var isValueInString = (cssValue.value.indexOf("\"") != -1);

            return !isValueInString;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getAutoCompleteRange: function(value, offset)
    {
        if (!Css.hasClass(this.target, "cssPropValue"))
            return {start: 0, end: value.length};

        var propRow = Dom.getAncestorByClass(this.target, "cssProp");
        var propName = Dom.getChildByClass(propRow, "cssPropName").textContent.toLowerCase();
        return CSSAutoCompleter.getPropertyRange(propName, value, offset);
    },

    getAutoCompleteList: function(preExpr, expr, postExpr, range, cycle, context, out)
    {
        if (Dom.getAncestorByClass(this.target, "importRule"))
        {
            return [];
        }
        else if (Dom.getAncestorByClass(this.target, "cssCharsetRule"))
        {
            return Css.charsets;
        }
        else if (Css.hasClass(this.target, "cssPropName"))
        {
            var nodeType = Xml.getElementSimpleType(Firebug.getRepObject(this.target));
            return CSSAutoCompleter.autoCompletePropertyName(nodeType, expr, cycle, out);
        }
        else if (Dom.getAncestorByClass(this.target, "cssDocumentRule") &&
                !Css.hasClass(this.target, "cssPropValue"))
        {
            return Css.documentConditions;
        }
        else if (Dom.getAncestorByClass(this.target, "cssKeyframesRule") &&
            !Css.hasClass(this.target, "cssPropValue"))
        {
            return Object.getOwnPropertyNames(Css.keyframeKeys);
        }
        else if (Dom.getAncestorByClass(this.target, "cssMediaRule") &&
            !Css.hasClass(this.target, "cssPropValue"))
        {
            return Css.mediaTypes;
        }
        else
        {
            var row = Dom.getAncestorByClass(this.target, "cssProp");
            var propName = Dom.getChildByClass(row, "cssPropName").textContent;
            var nodeType = Xml.getElementSimpleType(Firebug.getRepObject(this.target));

            return CSSAutoCompleter.autoCompletePropertyValue(nodeType, propName,
                preExpr, expr, postExpr, range, cycle, context, out);
        }
    },

    getAutoCompletePropSeparator: function(range, expr, prefixOf)
    {
        if (!Css.hasClass(this.target, "cssPropValue"))
            return null;

        var row = Dom.getAncestorByClass(this.target, "cssProp");
        var propName = Dom.getChildByClass(row, "cssPropName").textContent;
        return CSSAutoCompleter.getValuePropSeparator(propName, range);
    },

    autoCompleteAdjustSelection: function(value, offset)
    {
        if (offset >= 2 && value.substr(offset-2, 2) === "()")
            return offset-1;
        return offset;
    },

    doIncrementValue: function(value, amt, offset, offsetEnd)
    {
        var propName = null;
        if (Css.hasClass(this.target, "cssPropValue"))
        {
            var propRow = Dom.getAncestorByClass(this.target, "cssProp");
            propName = Dom.getChildByClass(propRow, "cssPropName").textContent;
        }

        var range = CSSModule.parseCSSValue(value, offset);
        var type = (range && range.type) || "";
        var expr = (range ? value.substring(range.start, range.end) : "");

        var completion = null, selection, info;
        if (type === "int")
        {
            if (propName === "opacity")
            {
                info = {minValue: 0, maxValue: 1};
                amt /= 100;
            }

            if (expr === "0" && value.lastIndexOf("(", offset) === -1 &&
                !Css.unitlessProperties.hasOwnProperty(propName))
            {
                // 0 is a length, and incrementing it normally will result in an
                // invalid value 1 or -1.  Thus, guess at a unit to add.
                var unitM = /\d([a-z]{1,4})/.exec(value);
                expr += (unitM ? unitM[1] : "px");
            }

            var newValue = this.incrementExpr(expr, amt, info);
            if (newValue !== null)
            {
                completion = newValue;
                selection = [0, completion.length];
            }
        }
        else if (type === "rgb" && expr.charAt(0) === "#")
        {
            var offsetIntoExpr = offset - range.start;
            var offsetEndIntoExpr = offsetEnd - range.start;

            // Increment a hex color.
            var res = this.incrementHexColor(expr, amt, offsetIntoExpr, offsetEndIntoExpr);
            if (res)
            {
                completion = res.value;
                selection = res.selection;
            }
        }
        else
        {
            if (type === "rgb" || type === "hsl")
            {
                info = {};
                var part = value.substring(range.start, offset).split(",").length - 1;
                if (part === 3) // alpha
                {
                    info.minValue = 0;
                    info.maxValue = 1;
                    amt /= 100;
                }
                else if (type === "rgb") // rgb color
                {
                    info.minValue = 0;
                    info.maxValue = 255;
                    if (Math.abs(amt) < 1)
                        amt = (amt < 0 ? -1 : 1);
                }
                else if (part !== 0) // hsl percentage
                {
                    info.minValue = 0;
                    info.maxValue = 100;

                    // If the selection is at the end of a percentage sign, select
                    // the previous number. This would have been less hacky if
                    // parseCSSValue parsed functions recursively.
                    if (value.charAt(offset-1) === "%")
                        --offset;
                }
            }

            return InlineEditor.prototype.doIncrementValue
                .call(this, value, amt, offset, offsetEnd, info);
        }

        if (completion === null)
            return;

        var preExpr = value.substr(0, range.start);
        var postExpr = value.substr(range.end);

        return {
            value: preExpr + completion + postExpr,
            start: range.start + selection[0],
            end: range.start + selection[1]
        };
    },

    incrementHexColor: function(expr, amt, offset, offsetEnd)
    {
        // Return early if no part of the expression is selected.
        if (offsetEnd > expr.length && offset >= expr.length)
            return;
        if (offset < 1 && offsetEnd <= 1)
            return;

        // Ignore the leading #.
        expr = expr.substr(1);
        --offset;
        --offsetEnd;

        // Clamp the selection to within the actual value.
        offset = Math.max(offset, 0);
        offsetEnd = Math.min(offsetEnd, expr.length);
        offsetEnd = Math.max(offsetEnd, offset);

        // Normalize #ABC -> #AABBCC.
        if (expr.length === 3)
        {
            expr = expr.charAt(0) + expr.charAt(0) +
                   expr.charAt(1) + expr.charAt(1) +
                   expr.charAt(2) + expr.charAt(2);
            offset *= 2;
            offsetEnd *= 2;
        }
        if (expr.length !== 6)
            return;

        if (offset === offsetEnd)
        {
            // There is only a single cursor position. Increment an adjacent
            // color, preferably one to the left.
            if (offset === 0)
                offsetEnd = 1;
            else
                offset = offsetEnd - 1;
        }

        // Make the selection cover entire parts.
        offset -= offset%2;
        offsetEnd += offsetEnd%2;

        // Remap the increments from [0.1, 1, 10, 100] to [1, 1, 16, 64].
        if (-1 < amt && amt < 1)
            amt = (amt < 0 ? -1 : 1);
        if (Math.abs(amt) === 10)
            amt = (amt < 0 ? -16 : 16);
        if (Math.abs(amt) === 100)
            amt = (amt < 0 ? -64 : 64);

        var isUpper = (expr.toUpperCase() === expr);

        for (var pos = offset; pos < offsetEnd; pos += 2)
        {
            // Increment the part in [pos, pos+2).
            var mid = expr.substr(pos, 2);
            var value = parseInt(mid, 16);
            if (isNaN(value))
                return;

            mid = Math.min(Math.max(value - amt, 0), 255).toString(16);
            while (mid.length < 2)
                mid = "0" + mid;

            // Make the incremented part upper-case if the original value can be
            // seen as such (this should happen even for, say, #444444, because
            // upper-case hex-colors are the default). Otherwise, the lower-case
            // result from .toString is used.
            if (isUpper)
                mid = mid.toUpperCase();

            expr = expr.substr(0, pos) + mid + expr.substr(pos+2);
        }

        return {value: "#" + expr, selection: [offset+1, offsetEnd+1]};
    }
});

// ********************************************************************************************* //
// Registration

return CSSEditor;

// ********************************************************************************************* //
});