/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/css/cssModule",
    "firebug/css/cssReps",
    "firebug/css/selectorEditor",
],
function(Firebug, FBTrace, Css, Dom, CSSModule, CSSReps, SelectorEditor) {

// ********************************************************************************************* //
// CSSRuleEditor

function CSSRuleEditor(doc)
{
    this.initializeInline(doc);
}

CSSRuleEditor.prototype = domplate(SelectorEditor.prototype,
{
    insertNewRow: function(target, insertWhere)
    {
        var emptyRule = {
            selector: "",
            id: "",
            props: [],
            isSelectorEditable: true
        };

        if (insertWhere == "before")
            return CSSReps.CSSStyleRuleTag.tag.insertBefore({rule: emptyRule}, target);
        else
            return CSSReps.CSSStyleRuleTag.tag.insertAfter({rule: emptyRule}, target);
    },

    beginEditing: function()
    {
        if (this.panel.name === "stylesheet" && this.panel.location)
        {
            this.doc = Css.getDocumentForStyleSheet(this.panel.location);
        }
        else if (this.panel.name === "css" && this.panel.selection)
        {
            this.doc = this.panel.selection.ownerDocument;
        }
        else
        {
            this.doc = this.panel.context.window.document;
        }
    },

    endEditing: function()
    {
        this.doc = null;
        return true;
    },

    saveEdit: function(target, value, previousValue)
    {
        var context = this.panel.context;

        if (FBTrace.DBG_CSS)
            FBTrace.sysout("CSSRuleEditor.saveEdit: '" + value + "'  '" + previousValue +
                "'", target);

        target.textContent = value;
        if (value === previousValue)
            return;

        var row = Dom.getAncestorByClass(target, "cssRule");
        var rule = Firebug.getRepObject(target);

        var searchRule = rule || Firebug.getRepObject(row.nextSibling);
        var oldRule, ruleIndex;

        if (searchRule)
        {
            // take care of media rules
            var styleSheet = searchRule.parentRule || searchRule.parentStyleSheet;
            if (!styleSheet)
                return;

            var cssRules = styleSheet.cssRules;
            ruleIndex = 0;
            while (ruleIndex < cssRules.length && searchRule != cssRules[ruleIndex])
                ruleIndex++;

            if (rule)
                oldRule = searchRule;
            else
                ruleIndex++;
        }
        else
        {
            var styleSheet;
            if (this.panel.name === "stylesheet")
            {
                styleSheet = this.panel.location;
                if (!styleSheet)
                {
                    var doc = context.window.document;
                    this.panel.location = styleSheet =
                        CSSModule.getDefaultStyleSheet(doc);
                }
            }
            else
            {
                if (this.panel.name !== "css")
                    return;

                var doc = this.panel.selection.ownerDocument;
                styleSheet = CSSModule.getDefaultStyleSheet(doc);
            }

            styleSheet = styleSheet.editStyleSheet ? styleSheet.editStyleSheet.sheet : styleSheet;
            cssRules = styleSheet.cssRules;
            ruleIndex = cssRules.length;
        }

        // Delete in all cases except for new add
        // We want to do this before the insert to ease change tracking
        if (oldRule)
        {
            CSSModule.deleteRule(styleSheet, ruleIndex);
        }

        var doMarkChange = true;

        // Firefox does not follow the spec for the update selector text case.
        // When attempting to update the value, firefox will silently fail.
        // See https://bugzilla.mozilla.org/show_bug.cgi?id=37468 for the quite
        // old discussion of this bug.
        // As a result we need to recreate the style every time the selector
        // changes.
        if (value)
        {
            var cssText = [ value, "{" ];
            var props = row.getElementsByClassName("cssProp");
            for (var i = 0; i < props.length; i++)
            {

                var propEl = props[i];
                if (!Css.hasClass(propEl, "disabledStyle"))
                {
                    var propName = Dom.getChildByClass(propEl, "cssPropName").textContent;
                    var propValue = Dom.getChildByClass(propEl, "cssPropValue").textContent;
                    cssText.push(propName + ":" + propValue + ";");
                }
            }

            cssText.push("}");
            cssText = cssText.join("");

            try
            {
                var insertLoc = CSSModule.insertRule(styleSheet, cssText, ruleIndex);

                rule = cssRules[insertLoc];

                ruleIndex++;

                var saveSuccess = (this.panel.name != "css");
                if (!saveSuccess)
                {
                    saveSuccess = (this.panel.selection &&
                        this.panel.selection.mozMatchesSelector(value)) ? true : 'almost';
                }

                this.box.setAttribute('saveSuccess', saveSuccess);
            }
            catch (err)
            {
                if (FBTrace.DBG_CSS || FBTrace.DBG_ERRORS)
                    FBTrace.sysout("CSS Insert Error: "+err, err);

                target.textContent = previousValue;
                // create dummy rule to be able to recover from error
                var insertLoc = CSSModule.insertRule(styleSheet,
                    'selectorSavingError{}', ruleIndex);
                rule = cssRules[insertLoc];

                this.box.setAttribute('saveSuccess', false);

                doMarkChange = false;
            }
        }
        else
        {
            // XXX There is currently no way to re-add the rule after this happens.
            rule = undefined;
        }

        // Update the rep object
        row.repObject = rule;
        if (oldRule && rule)
            this.panel.remapRule(context, oldRule, rule);

        if (doMarkChange)
            this.panel.markChange(this.panel.name == "stylesheet");
    },

    getAutoCompleteRange: function(value, offset)
    {
        if (!Css.hasClass(this.target, "cssSelector"))
            return;
        return SelectorEditor.prototype.getAutoCompleteRange.apply(this, arguments);
    },

    getAutoCompleteList: function(preExpr, expr, postExpr, range, cycle, context, out)
    {
        if (!Css.hasClass(this.target, "cssSelector"))
            return [];
        return SelectorEditor.prototype.getAutoCompleteList.apply(this, arguments);
    },

    getAutoCompletePropSeparator: function(range, expr, prefixOf)
    {
        if (!Css.hasClass(this.target, "cssSelector"))
            return null;
        return SelectorEditor.prototype.getAutoCompletePropSeparator.apply(this, arguments);
    },

    advanceToNext: function(target, charCode)
    {
        if (charCode == 123 /* "{" */)
        {
            return true;
        }
    }
});

// ********************************************************************************************* //
// Registration

return CSSRuleEditor;

// ********************************************************************************************* //
});
