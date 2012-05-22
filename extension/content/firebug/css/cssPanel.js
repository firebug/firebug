/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/wrapper",
    "firebug/lib/url",
    "firebug/js/sourceLink",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/chrome/window",
    "firebug/lib/search",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/lib/fonts",
    "firebug/lib/xml",
    "firebug/lib/persist",
    "firebug/lib/system",
    "firebug/chrome/menu",
    "firebug/css/cssReps",
    "firebug/editor/editor",
    "firebug/editor/editorSelector",
    "firebug/chrome/searchBox",
    "firebug/css/cssModule",
],
function(Obj, Firebug, Domplate, FirebugReps, Locale, Events, Wrapper, Url,
    SourceLink, Css, Dom, Win, Search, Str, Arr, Fonts, Xml, Persist, System, Menu,
    CSSInfoTip) {

with (Domplate) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

var CSSDomplateBase =
{
    isEditable: function(rule)
    {
        return !rule.isSystemSheet && !rule.isNotEditable;
    },

    isSelectorEditable: function(rule)
    {
        return rule.isSelectorEditable && this.isEditable(rule);
    }
};

var CSSPropTag = domplate(CSSDomplateBase,
{
    tag:
        DIV({"class": "cssProp focusRow", $disabledStyle: "$prop.disabled",
            $editGroup: "$rule|isEditable",
            $cssOverridden: "$prop.overridden",
            role: "option"},

            // Use spaces for indent so, copy to clipboard is nice.
            SPAN("&nbsp;&nbsp;&nbsp;&nbsp;"),
            SPAN({"class": "cssPropName", $editable: "$rule|isEditable"},
                "$prop.name"
            ),

            // Use space here so, copy to clipboard has it (3266).
            SPAN({"class": "cssColon"}, ":&nbsp;"),
            SPAN({"class": "cssPropValue", $editable: "$rule|isEditable"},
                "$prop.value$prop.important"
            ),
            SPAN({"class": "cssSemi"}, ";"
        )
    )
});

var CSSRuleTag =
    TAG("$rule.tag", {rule: "$rule"});

var CSSImportRuleTag = domplate(CSSDomplateBase,
{
    tag:
        DIV({"class": "cssRule insertInto focusRow importRule", _repObject: "$rule.rule"},
        "@import &quot;",
        A({"class": "objectLink", _repObject: "$rule.rule.styleSheet"}, "$rule.rule.href"),
        "&quot;",
        SPAN({"class": "separator"}, "$rule.rule|getSeparator"),
        SPAN({"class": "cssMediaQuery", $editable: "$rule|isEditable"},
            "$rule.rule.media.mediaText"),
        ";"
    ),

    getSeparator: function(rule)
    {
        return rule.media.mediaText == "" ? "" : " ";
    }
});

var CSSCharsetRuleTag = domplate(CSSDomplateBase,
{
    tag:
        DIV({"class": "cssRule focusRow cssCharsetRule", _repObject: "$rule.rule"},
            SPAN({"class": "cssRuleName"}, "@charset"),
            "&nbsp;&quot;",
            SPAN({"class": "cssRuleValue", $editable: "$rule|isEditable"}, "$rule.rule.encoding"),
            "&quot;;"
        )
});

var CSSNamespaceRuleTag = domplate(CSSDomplateBase,
{
    tag:
        DIV({"class": "cssRule focusRow cssNamespaceRule", _repObject: "$rule.rule"},
            SPAN({"class": "cssRuleName"}, "@namespace"),
            SPAN({"class": "separator"}, "$rule.prefix|getSeparator"),
            SPAN({"class": "cssNamespacePrefix", $editable: "$rule|isEditable"}, "$rule.prefix"),
            "&nbsp;&quot;",
            SPAN({"class": "cssNamespaceName", $editable: "$rule|isEditable"}, "$rule.name"),
            "&quot;;"
        ),

    getSeparator: function(prefix)
    {
        return prefix == "" ? "" : " ";
    }
});

var CSSFontFaceRuleTag = domplate(CSSDomplateBase,
{
    tag:
        DIV({"class": "cssRule cssFontFaceRule",
            $cssEditableRule: "$rule|isEditable",
            $insertInto: "$rule|isEditable",
            _repObject: "$rule.rule",
            role : 'presentation'},
            DIV({"class": "cssHead focusRow", role : "listitem"}, "@font-face {"),
            DIV({role : "group"},
                DIV({"class": "cssPropertyListBox", role: "listbox"},
                    FOR("prop", "$rule.props",
                        TAG(CSSPropTag.tag, {rule: "$rule", prop: "$prop"})
                    )
                )
            ),
            DIV({$editable: "$rule|isEditable", $insertBefore:"$rule|isEditable",
                role:"presentation"},
                "}"
            )
        )
});

var CSSStyleRuleTag = domplate(CSSDomplateBase,
{
    tag:
        DIV({"class": "cssRule",
            $cssEditableRule: "$rule|isEditable",
            $insertInto: "$rule|isEditable",
            $editGroup: "$rule|isSelectorEditable",
            _repObject: "$rule.rule",
            "ruleId": "$rule.id", role: "presentation"},
            DIV({"class": "cssHead focusRow", role: "listitem"},
                SPAN({"class": "cssSelector", $editable: "$rule|isSelectorEditable"},
                    "$rule.selector"),
                    " {"
                ),
            DIV({role: "group"},
                DIV({"class": "cssPropertyListBox", _rule: "$rule", role: "listbox"},
                    FOR("prop", "$rule.props",
                        TAG(CSSPropTag.tag, {rule: "$rule", prop: "$prop"})
                    )
                )
            ),
            DIV({$editable: "$rule|isEditable", $insertBefore: "$rule|isEditable",
                role:"presentation"},
                "}"
            )
        )
});

Firebug.CSSStyleRuleTag = CSSStyleRuleTag;

// ********************************************************************************************* //

const reSplitCSS = /(url\("?[^"\)]+?"?\))|(rgba?\([^)]*\)?)|(hsla?\([^)]*\)?)|(#[\dA-Fa-f]+)|(-?\d+(\.\d+)?(%|[a-z]{1,4})?)|"([^"]*)"?|'([^']*)'?|([^,\s\/!\(\)]+)|(!(.*)?)/;
const reURL = /url\("?([^"\)]+)?"?\)/;
const reRepeat = /no-repeat|repeat-x|repeat-y|repeat/;
const reSelectorChar = /[-_0-9a-zA-Z]/;

// ********************************************************************************************* //
// CSS Module

Firebug.CSSStyleSheetPanel = function() {};

Firebug.CSSStyleSheetPanel.prototype = Obj.extend(Firebug.Panel,
{
    template: domplate(
    {
        tag:
            DIV({"class": "cssSheet insertInto a11yCSSView"},
                FOR("rule", "$rules",
                    CSSRuleTag
                ),
                DIV({"class": "cssSheet editable insertBefore"}, ""
                )
            )
    }),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    refresh: function()
    {
        if (this.location)
            this.updateLocation(this.location);
        else if (this.selection)
            this.updateSelection(this.selection);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // CSS Editing

    startBuiltInEditing: function(css)
    {
        if (FBTrace.DBG_CSS)
            FBTrace.sysout("CSSStyleSheetPanel.startBuiltInEditing", css);

        if (!this.stylesheetEditor)
            this.stylesheetEditor = new StyleSheetEditor(this.document);

        var styleSheet = this.location.editStyleSheet
            ? this.location.editStyleSheet.sheet
            : this.location;

        this.stylesheetEditor.styleSheet = this.location;
        Firebug.Editor.startEditing(this.panelNode, css, this.stylesheetEditor);

        //this.stylesheetEditor.scrollToLine(topmost.line, topmost.offset);
        this.stylesheetEditor.input.scrollTop = this.panelNode.scrollTop;
    },

    startLiveEditing: function(styleSheet, context)
    {
        var css = getStyleSheetCSS(styleSheet, context);
        this.startBuiltInEditing(css);
    },

    startSourceEditing: function(styleSheet, context)
    {
        if (Firebug.CSSDirtyListener.isDirty(styleSheet, context))
        {
            var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"].
                getService(Ci.nsIPromptService);

            var proceedToEdit = prompts.confirm(null, Locale.$STR("Firebug"),
                Locale.$STR("confirmation.Edit_CSS_Source"));

            if (!proceedToEdit)
            {
                this.stopEditing();
                return;
            }
        }

        var css = getOriginalStyleSheetCSS(styleSheet, context);
        this.startBuiltInEditing(css);
    },

    stopEditing: function()
    {
        if (FBTrace.DBG_CSS)
            FBTrace.sysout("CSSStyleSheetPanel.stopEditing");

        if (this.currentCSSEditor)
        {
            this.currentCSSEditor.stopEditing();
            delete this.currentCSSEditor;
        }
        else
        {
            Firebug.Editor.stopEditing();
        }
    },

    toggleEditing: function()
    {
        if (this.editing)
        {
            this.stopEditing();
            Events.dispatch(this.fbListeners, 'onStopCSSEditing', [this.context]);
        }
        else
        {
            if (!this.location)
                return;

            var styleSheet = this.location.editStyleSheet
                ? this.location.editStyleSheet.sheet
                : this.location;

            this.currentCSSEditor = Firebug.CSSModule.getCurrentEditor();
            try
            {
                this.currentCSSEditor.startEditing(styleSheet, this.context, this);
                Events.dispatch(this.fbListeners, 'onStartCSSEditing', [styleSheet, this.context]);
            }
            catch(exc)
            {
                var mode = Firebug.CSSModule.getCurrentEditorName();
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("editor.startEditing ERROR "+exc, {exc: exc, name: mode,
                        currentEditor: this.currentCSSEditor, styleSheet: styleSheet,
                        CSSModule:Firebug.CSSModule});
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    loadOriginalSource: function()
    {
        if (!this.location)
            return;

        var styleSheet = this.location;

        var css = getOriginalStyleSheetCSS(styleSheet, this.context);

        this.stylesheetEditor.setValue(css);
        this.stylesheetEditor.saveEdit(null, css);
        //styleSheet.editStyleSheet.showUnformated = true;
    },

    getStylesheetURL: function(rule, getBaseUri)
    {
        if (this.location.href)
            return this.location.href;
        else if (getBaseUri)
            return this.context.window.document.baseURI;
        else
            return this.context.window.location.href;
    },

    getRuleByLine: function(styleSheet, line)
    {
        if (!Dom.domUtils)
            return null;

        var cssRules = styleSheet.cssRules;
        for (var i = 0; i < cssRules.length; ++i)
        {
            var rule = cssRules[i];
            var previousRule;
            if (rule instanceof window.CSSStyleRule)
            {
                var selectorLine = Dom.domUtils.getRuleLine(rule);
                // The declarations are on lines equal or greater than the selectorLine
                if (selectorLine === line) // then the line requested is a selector line
                    return rule;
                if (selectorLine > line) // then we passed the rule for the requested line
                    return previousRule;
                // else the requested line is still ahead
                previousRule = rule;
            }
        }
    },

    highlightRule: function(rule)
    {
        var ruleElement = Firebug.getElementByRepObject(this.panelNode.firstChild, rule);
        if (ruleElement)
        {
            Dom.scrollIntoCenterView(ruleElement, this.panelNode);
            Css.setClassTimed(ruleElement, "jumpHighlight", this.context);
        }
    },

    getStyleSheetRules: function(context, styleSheet)
    {
        if (!styleSheet)
            return [];

        var isSystemSheet = Url.isSystemStyleSheet(styleSheet);

        function appendRules(cssRules)
        {
            var i, props, ruleId;

            if (!cssRules)
                return;

            for (i=0; i<cssRules.length; ++i)
            {
                var rule = cssRules[i];
                if (rule instanceof window.CSSStyleRule)
                {
                    props = this.getRuleProperties(context, rule);
                    ruleId = this.getRuleId(rule);
                    rules.push({
                        tag: CSSStyleRuleTag.tag,
                        rule: rule,
                        id: ruleId,
                        // Show universal selectors with pseudo-class
                        // (http://code.google.com/p/fbug/issues/detail?id=3683)
                        selector: rule.selectorText.replace(/ :/g, " *:"),
                        props: props,
                        isSystemSheet: isSystemSheet,
                        isSelectorEditable: true
                    });
                }
                else if (rule instanceof window.CSSImportRule)
                {
                    rules.push({tag: CSSImportRuleTag.tag, rule: rule});
                }
                else if (rule instanceof window.CSSCharsetRule)
                {
                  rules.push({tag: CSSCharsetRuleTag.tag, rule: rule});
                }
                else if (rule instanceof window.CSSMediaRule ||
                    rule instanceof window.CSSMozDocumentRule)
                {
                    appendRules.apply(this, [Css.safeGetCSSRules(rule)]);
                }
                else if (rule instanceof window.CSSFontFaceRule)
                {
                    props = this.parseCSSProps(rule.style);
                    this.sortProperties(props);
                    rules.push({
                        tag: CSSFontFaceRuleTag.tag, rule: rule,
                        props: props, isSystemSheet: isSystemSheet,
                        isNotEditable: true
                    });
                }
                else if (rule instanceof window.CSSNameSpaceRule &&
                    !(rule instanceof window.MozCSSKeyframesRule ||
                        rule instanceof window.MozCSSKeyframeRule))
                {
                    // Workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=754772
                    // MozCSSKeyframesRules and MozCSSKeyframeRules are recognized as
                    // CSSNameSpaceRules, so explicitly check whether the rule is not a
                    // MozCSSKeyframesRule or a MozCSSKeyframeRule

                    var reNamespace = /^@namespace ((.+) )?url\("(.*?)"\);$/;
                    var namespace = rule.cssText.match(reNamespace);
                    var prefix = namespace[2] || "";
                    var name = namespace[3];
                    rules.push({tag: CSSNamespaceRuleTag.tag, rule: rule, prefix: prefix,
                        name: name, isNotEditable: true});
                }
                else
                {
                    if (FBTrace.DBG_ERRORS && FBTrace.DBG_CSS)
                        FBTrace.sysout("css getStyleSheetRules failed to classify a rule ", rule);
                }
            }
        }

        var rules = [];
        appendRules.apply(this, [Css.safeGetCSSRules(styleSheet)]);
        return rules;
    },

    parseCSSProps: function(style, inheritMode)
    {
        var m;
        var props = [];

        if (Firebug.expandShorthandProps)
        {
            var count = style.length-1;
            var index = style.length;

            while (index--)
            {
                var propName = style.item(count - index);
                this.addProperty(propName, style.getPropertyValue(propName),
                    !!style.getPropertyPriority(propName), false, inheritMode, props);
            }
        }
        else
        {
            var lines = style.cssText.match(/(?:[^;\(]*(?:\([^\)]*?\))?[^;\(]*)*;?/g);
            var propRE = /\s*([^:\s]*)\s*:\s*(.*?)\s*(! important)?;?$/;
            var line;
            var i=0;
            while(line = lines[i++])
            {
                m = propRE.exec(line);
                if(!m)
                    continue;

                //var name = m[1], value = m[2], important = !!m[3];
                if (m[2])
                    this.addProperty(m[1], m[2], !!m[3], false, inheritMode, props);
            }
        }

        return props;
    },

    sortProperties: function(props)
    {
        props.sort(function(a, b)
        {
            return a.name > b.name ? 1 : -1;
        });
    },

    getRuleProperties: function(context, rule, inheritMode)
    {
        var props = this.parseCSSProps(rule.style, inheritMode);

        var ruleId = this.getRuleId(rule);
        this.addOldProperties(context, ruleId, inheritMode, props);
        this.sortProperties(props);

        return props;
    },

    addOldProperties: function(context, ruleId, inheritMode, props)
    {
        if (context.selectorMap && context.selectorMap.hasOwnProperty(ruleId) )
        {
            var moreProps = context.selectorMap[ruleId];
            for (var i = 0; i < moreProps.length; ++i)
            {
                var prop = moreProps[i];
                this.addProperty(prop.name, prop.value, prop.important, true, inheritMode, props);
            }
        }
    },

    addProperty: function(name, value, important, disabled, inheritMode, props)
    {
        if (inheritMode && !Css.inheritedStyleNames[name])
            return;

        name = this.translateName(name, value);
        if (name)
        {
            value = Css.stripUnits(Css.rgbToHex(value));
            important = important ? " !important" : "";

            var prop = {name: name, value: value, important: important, disabled: disabled};
            props.push(prop);
        }
    },

    translateName: function(name, value)
    {
        // Don't show these proprietary Mozilla properties
        if ((value == "-moz-initial"
            && (name == "-moz-background-clip" || name == "-moz-background-origin"
                || name == "-moz-background-inline-policy"))
        || (value == "physical"
            && (name == "margin-left-ltr-source" || name == "margin-left-rtl-source"
                || name == "margin-right-ltr-source" || name == "margin-right-rtl-source"))
        || (value == "physical"
            && (name == "padding-left-ltr-source" || name == "padding-left-rtl-source"
                || name == "padding-right-ltr-source" || name == "padding-right-rtl-source")))
            return null;

        // Translate these back to the form the user probably expects
        if (name == "margin-left-value")
            return "margin-left";
        else if (name == "margin-right-value")
            return "margin-right";
        else if (name == "margin-top-value")
            return "margin-top";
        else if (name == "margin-bottom-value")
            return "margin-bottom";
        else if (name == "padding-left-value")
            return "padding-left";
        else if (name == "padding-right-value")
            return "padding-right";
        else if (name == "padding-top-value")
            return "padding-top";
        else if (name == "padding-bottom-value")
            return "padding-bottom";
        // XXXjoe What about border!
        else
            return name;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    editElementStyle: function()
    {
        var rulesBox = this.panelNode.getElementsByClassName("cssElementRuleContainer")[0];
        var styleRuleBox = rulesBox && Firebug.getElementByRepObject(rulesBox, this.selection);
        if (!styleRuleBox)
        {
            var rule = {rule: this.selection, inherited: false, selector: "element.style", props: []};
            if (!rulesBox)
            {
                // The element did not have any displayed styles. We need to create the
                // whole tree and remove the no styles message
                styleRuleBox = this.template.cascadedTag.replace({
                    rules: [rule], inherited: [], inheritLabel: Locale.$STR("InheritedFrom")
                }, this.panelNode);

                styleRuleBox = styleRuleBox.getElementsByClassName("cssElementRuleContainer")[0];
            }
            else
                styleRuleBox = this.template.ruleTag.insertBefore({rule: rule}, rulesBox);

            styleRuleBox = styleRuleBox.getElementsByClassName("insertInto")[0];
        }

        Firebug.Editor.insertRowForObject(styleRuleBox);
    },

    editMediaQuery: function(target)
    {
        var row = Dom.getAncestorByClass(target, "cssRule");
        var mediaQueryBox = Dom.getChildByClass(row, "cssMediaQuery");
        Firebug.Editor.startEditing(mediaQueryBox);
    },

    insertPropertyRow: function(row)
    {
        Firebug.Editor.insertRowForObject(row);
    },

    insertRule: function(row)
    {
        var location = Dom.getAncestorByClass(row, "cssRule");
        if (!location)
        {
            location = Dom.getChildByClass(this.panelNode, "cssSheet");

            // Stylesheet has no rules
            if (!location)
                this.template.tag.replace({rules: []}, this.panelNode);

            location = Dom.getChildByClass(this.panelNode, "cssSheet");
            Firebug.Editor.insertRowForObject(location);
        }
        else
        {
            Firebug.Editor.insertRow(location, "before");
        }
    },

    editPropertyRow: function(row)
    {
        var propValueBox = Dom.getChildByClass(row, "cssPropValue");
        Firebug.Editor.startEditing(propValueBox);
    },

    deletePropertyRow: function(row)
    {
        var rule = Firebug.getRepObject(row);
        var propName = Dom.getChildByClass(row, "cssPropName").textContent;
        Firebug.CSSModule.deleteProperty(rule, propName, this.context);

        // Remove the property from the selector map, if it was disabled
        var ruleId = Firebug.getRepNode(row).getAttribute("ruleId");
        if ( this.context.selectorMap && this.context.selectorMap.hasOwnProperty(ruleId) )
        {
            var map = this.context.selectorMap[ruleId];
            for (var i = 0; i < map.length; ++i)
            {
                if (map[i].name == propName)
                {
                    map.splice(i, 1);
                    break;
                }
            }
        }

        if (this.name == "stylesheet")
            Events.dispatch(this.fbListeners, 'onInlineEditorClose', [this, row.firstChild, true]);
        row.parentNode.removeChild(row);

        this.markChange(this.name == "stylesheet");
    },

    disablePropertyRow: function(row)
    {
        Css.toggleClass(row, "disabledStyle");

        var rule = Firebug.getRepObject(row);
        var propName = Dom.getChildByClass(row, "cssPropName").textContent;

        if (!this.context.selectorMap)
            this.context.selectorMap = {};

        // XXXjoe Generate unique key for elements too
        var ruleId = Firebug.getRepNode(row).getAttribute("ruleId");
        if (!(this.context.selectorMap.hasOwnProperty(ruleId)))
            this.context.selectorMap[ruleId] = [];

        var map = this.context.selectorMap[ruleId];
        var propValue = Dom.getChildByClass(row, "cssPropValue").textContent;
        var parsedValue = parsePriority(propValue);

        Firebug.CSSModule.disableProperty(Css.hasClass(row, "disabledStyle"), rule,
            propName, parsedValue, map, this.context);

        this.markChange(this.name == "stylesheet");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onMouseDown: function(event)
    {
    },

    onClick: function(event)
    {
        var row;

        if (!Events.isLeftClick(event))
            return;

        // XXjoe Hack to only allow clicking on the checkbox
        if ((event.clientX <= 20) && Events.isSingleClick(event))
        {
            if (Css.hasClass(event.target, "textEditor inlineExpander"))
                return;

            row = Dom.getAncestorByClass(event.target, "cssProp");
            if (row && Css.hasClass(row, "editGroup"))
            {
                this.disablePropertyRow(row);
                Events.cancelEvent(event);
            }
        }
        else if ((event.clientX >= 20) && Events.isDoubleClick(event))
        {
            row = Dom.getAncestorByClass(event.target, "cssRule");
            if (row && !Dom.getAncestorByClass(event.target, "cssPropName")
                && !Dom.getAncestorByClass(event.target, "cssPropValue"))
            {
                this.insertPropertyRow(row);
                Events.cancelEvent(event);
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    name: "stylesheet",
    parentPanel: null,
    searchable: true,
    dependents: ["css", "stylesheet", "dom", "domSide", "layout"],
    enableA11y: true,
    deriveA11yFrom: "css",
    order: 30,

    initialize: function()
    {
        this.onMouseDown = Obj.bind(this.onMouseDown, this);
        this.onClick = Obj.bind(this.onClick, this);

        Firebug.Panel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        state.scrollTop = this.panelNode.scrollTop ? this.panelNode.scrollTop : this.lastScrollTop;

        Persist.persistObjects(this, state);

        this.stopEditing();

        Firebug.Panel.destroy.apply(this, arguments);
    },

    initializeNode: function(oldPanelNode)
    {
        Events.addEventListener(this.panelNode, "mousedown", this.onMouseDown, false);
        Events.addEventListener(this.panelNode, "click", this.onClick, false);

        Firebug.Panel.initializeNode.apply(this, arguments);
    },

    destroyNode: function()
    {
        Events.removeEventListener(this.panelNode, "mousedown", this.onMouseDown, false);
        Events.removeEventListener(this.panelNode, "click", this.onClick, false);

        Firebug.Panel.destroyNode.apply(this, arguments);
    },

    show: function(state)
    {
        Firebug.Inspector.stopInspecting(true);

        this.showToolbarButtons("fbCSSButtons", true);

        Firebug.CSSModule.updateEditButton();

        // wait for loadedContext to restore the panel
        if (this.context.loaded && !this.location)
        {
            Persist.restoreObjects(this, state);

            if (!this.location)
                this.location = this.getDefaultLocation();

            if (state && state.scrollTop)
                this.panelNode.scrollTop = state.scrollTop;
        }
    },

    hide: function()
    {
        this.lastScrollTop = this.panelNode.scrollTop;
    },

    supportsObject: function(object, type)
    {
        if (object instanceof window.CSSStyleSheet)
        {
            return 1;
        }
        else if (object instanceof window.CSSRule ||
            (object instanceof window.CSSStyleDeclaration && object.parentRule) ||
            (object instanceof SourceLink.SourceLink && object.type == "css" &&
                Url.reCSS.test(object.href)))
        {
            return 2;
        }
        else
        {
            return 0;
        }
    },

    updateLocation: function(styleSheet)
    {
        if (FBTrace.DBG_CSS)
            FBTrace.sysout("css.updateLocation; " + (styleSheet ? styleSheet.href : "no stylesheet"));

        var rules = [];
        if (styleSheet)
        {
            // Skip ignored stylesheets, but don't skip the
            // default stylesheet that is used in case there is no other stylesheet
            // on the page.
            var shouldIgnore = Firebug.shouldIgnore(styleSheet.ownerNode);
            var contentView = Wrapper.getContentView(styleSheet);
            var isDefault = contentView && contentView.defaultStylesheet;
            if (!shouldIgnore || isDefault)
            {
                if (styleSheet.editStyleSheet)
                    styleSheet = styleSheet.editStyleSheet.sheet;
                var rules = this.getStyleSheetRules(this.context, styleSheet);
            }
        }

        if (rules.length)
        {
            this.template.tag.replace({rules: rules}, this.panelNode);
        }
        else
        {
            // If there are no rules on the page display a description that also
            // contains a link "create a rule".
            var warning = FirebugReps.Warning.tag.replace({object: ""}, this.panelNode);
            FirebugReps.Description.render(Locale.$STR("css.EmptyStyleSheet"),
                warning, Obj.bind(this.insertRule, this));
        }

        this.showToolbarButtons("fbCSSButtons", !Url.isSystemStyleSheet(this.location));

        Events.dispatch(this.fbListeners, "onCSSRulesAdded", [this, this.panelNode]);

        // If the full editing mode (not the inline) is on while the location changes,
        // open the editor again for another file.
        if (this.editing && this.stylesheetEditor && this.stylesheetEditor.editing)
        {
            // Remove the editing flag to avoid recursion. The StylesheetEditor.endEditing
            // calls refresh and consequently updateLocation of the CSS panel.
            this.editing = null;

            // Stop the current editing.
            this.stopEditing();

            // ... and open the editor again.
            this.toggleEditing();
        }
    },

    updateSelection: function(object)
    {
        this.selection = null;

        if (object instanceof window.CSSStyleDeclaration)
        {
            object = object.parentRule;
        }

        if (object instanceof window.CSSRule)
        {
            this.navigate(object.parentStyleSheet);
            this.highlightRule(object);
        }
        else if (object instanceof window.CSSStyleSheet)
        {
            this.navigate(object);
        }
        else if (object instanceof SourceLink.SourceLink)
        {
            try
            {
                var sourceLink = object;

                var sourceFile = Firebug.SourceFile.getSourceFileByHref(sourceLink.href, this.context);
                if (sourceFile)
                {
                    Dom.clearNode(this.panelNode);  // replace rendered stylesheets
                    this.showSourceFile(sourceFile);

                    var lineNo = object.line;
                    if (lineNo)
                        this.scrollToLine(lineNo, this.jumpHighlightFactory(lineNo, this.context));
                }
                else // XXXjjb we should not be taking this path
                {
                    var stylesheet = Css.getStyleSheetByHref(sourceLink.href, this.context);
                    if (stylesheet)
                    {
                        this.navigate(stylesheet);
                    }
                    else
                    {
                        if (FBTrace.DBG_CSS)
                            FBTrace.sysout("css.updateSelection no sourceFile for " +
                                sourceLink.href, sourceLink);
                    }
                }
            }
            catch(exc)
            {
                if (FBTrace.DBG_CSS)
                    FBTrace.sysout("css.upDateSelection FAILS "+exc, exc);
            }
        }
    },

    updateOption: function(name, value)
    {
        if (name == "expandShorthandProps")
            this.refresh();
    },

    getLocationList: function()
    {
        var styleSheets = Css.getAllStyleSheets(this.context);
        return styleSheets;
    },

    getOptionsMenuItems: function()
    {
        return [
            Menu.optionMenu("Expand_Shorthand_Properties", "expandShorthandProps",
                "css.option.tip.Expand_Shorthand_Properties"),
            "-",
            {
                label: "Refresh",
                tooltiptext: "panel.tip.Refresh",
                command: Obj.bind(this.refresh, this)
            }
        ];
    },

    getContextMenuItems: function(style, target)
    {
        var items = [];

        if (target.nodeName == "TEXTAREA")
        {
            items = Firebug.BaseEditor.getContextMenuItems();
            items.push(
                "-",
                {
                    label: "Load_Original_Source",
                    tooltiptext: "css.tip.Load_Original_Source",
                    command: Obj.bindFixed(this.loadOriginalSource, this)
                }
            );
            return items;
        }

        if (Css.hasClass(target, "cssSelector"))
        {
            items.push(
                {
                    label: "Copy_Rule_Declaration",
                    tooltiptext: "css.tip.Copy_Rule_Declaration",
                    id: "fbCopyRuleDeclaration",
                    command: Obj.bindFixed(this.copyRuleDeclaration, this, target)
                },
                {
                    label: "Copy_Style_Declaration",
                    tooltiptext: "css.tip.Copy_Style_Declaration",
                    id: "fbCopyStyleDeclaration",
                    command: Obj.bindFixed(this.copyStyleDeclaration, this, target)
                }
            );
        }

        if (this.infoTipType == "color")
        {
            items.push(
                {
                    label: "CopyColor",
                    tooltiptext: "css.tip.Copy_Color",
                    command: Obj.bindFixed(System.copyToClipboard, System, this.infoTipObject)
                }
            );
        }
        else if (this.infoTipType == "image")
        {
            items.push(
                {
                    label: "CopyImageLocation",
                    tooltiptext: "css.tip.Copy_Image_Location",
                    command: Obj.bindFixed(System.copyToClipboard, System, this.infoTipObject)
                },
                {
                    label: "OpenImageInNewTab",
                    tooltiptext: "css.tip.Open_Image_In_New_Tab",
                    command: Obj.bindFixed(Win.openNewTab, Win, this.infoTipObject)
                }
            );
        }

        if (!Url.isSystemStyleSheet(this.selection))
        {
            items.push(
                "-",
                {
                    label: "NewRule",
                    tooltiptext: "css.tip.New_Rule",
                    id: "fbNewCSSRule",
                    command: Obj.bindFixed(this.insertRule, this, target)
                }
            );
        }

        if (Css.hasClass(target, "cssSelector"))
        {
            var selector = Str.cropString(target.textContent, 30);
            items.push(
                {
                    label: Locale.$STRF("css.Delete_Rule", [selector]),
                    tooltiptext: Locale.$STRF("css.tip.Delete_Rule", [selector]),
                    nol10n: true,
                    id: "fbDeleteRuleDeclaration",
                    command: Obj.bindFixed(this.deleteRuleDeclaration, this, target)
                }
            );
        }

        var cssRule = Dom.getAncestorByClass(target, "cssRule");
        if (cssRule)
        {
            if(Css.hasClass(cssRule, "cssEditableRule"))
            {
                items.push(
                    "-",
                    {
                        label: "NewProp",
                        tooltiptext: "css.tip.New_Prop",
                        id: "fbNewCSSProp",
                        command: Obj.bindFixed(this.insertPropertyRow, this, target)
                    }
                );
    
                var propRow = Dom.getAncestorByClass(target, "cssProp");
                if (propRow)
                {
                    var propName = Dom.getChildByClass(propRow, "cssPropName").textContent;
                    var isDisabled = Css.hasClass(propRow, "disabledStyle");
    
                    items.push(
                        {
                            label: Locale.$STRF("EditProp", [propName]),
                            tooltiptext: Locale.$STRF("css.tip.Edit_Prop", [propName]),
                            nol10n: true,
                            command: Obj.bindFixed(this.editPropertyRow, this, propRow)
                        },
                        {
                            label: Locale.$STRF("DeleteProp", [propName]),
                            tooltiptext: Locale.$STRF("css.tip.Delete_Prop", [propName]),
                            nol10n: true,
                            command: Obj.bindFixed(this.deletePropertyRow, this, propRow)
                        },
                        {
                            label: Locale.$STRF("DisableProp", [propName]),
                            tooltiptext: Locale.$STRF("css.tip.Disable_Prop", [propName]),
                            nol10n: true,
                            type: "checkbox",
                            checked: isDisabled,
                            command: Obj.bindFixed(this.disablePropertyRow, this, propRow)
                        }
                    );
                }
            }
    
            if (Css.hasClass(cssRule, "importRule"))
            {
                items.push(
                    {
                        label: "css.menu.Edit_Media_Query",
                        tooltiptext: "css.menu.tip.Edit_Media_Query",
                        id: "fbEditMediaQuery",
                        command: Obj.bindFixed(this.editMediaQuery, this, target)
                    }
                );
            }
        }

        items.push(
            "-",
            {
                label: "panel.Refresh",
                command: Obj.bind(this.refresh, this),
                tooltiptext: "panel.tip.Refresh"
            }
        );

        return items;
    },

    browseObject: function(object)
    {
        if (this.infoTipType == "image")
        {
            Win.openNewTab(this.infoTipObject);
            return true;
        }
    },

    showInfoTip: function(infoTip, target, x, y, rangeParent, rangeOffset)
    {
        var propValue = Dom.getAncestorByClass(target, "cssPropValue");
        if (propValue)
        {
            var text = propValue.textContent;
            var prop = Dom.getAncestorByClass(target, "cssProp");
            var propNameNode = prop.getElementsByClassName("cssPropName").item(0);
            var propName = propNameNode.textContent.toLowerCase();
            var cssValue;

            if (propName == "font" || propName == "font-family")
            {
                if (text.charAt(rangeOffset) == ",")
                    return;

                cssValue = Firebug.CSSModule.parseCSSFontFamilyValue(text, rangeOffset, propName);
            }
            else
            {
                cssValue = Firebug.CSSModule.parseCSSValue(text, rangeOffset);
            }

            if (!cssValue)
                return false;

            if (cssValue.value == this.infoTipValue)
                return true;

            this.infoTipValue = cssValue.value;

            switch (cssValue.type)
            {
                case "rgb":
                case "hsl":
                case "gradient":
                case "colorKeyword":
                    this.infoTipType = "color";
                    this.infoTipObject = cssValue.value;
                    return CSSInfoTip.populateColorInfoTip(infoTip, cssValue.value);

                case "url":
                    if (Css.isImageRule(Xml.getElementSimpleType(Firebug.getRepObject(target)),
                        propNameNode.textContent))
                    {
                        var rule = Firebug.getRepObject(target);
                        var baseURL = this.getStylesheetURL(rule, true);
                        var relURL = Firebug.CSSModule.parseURLValue(cssValue.value);
                        var absURL = Url.isDataURL(relURL) ? relURL : Url.absoluteURL(relURL, baseURL);
                        var repeat = Firebug.CSSModule.parseRepeatValue(text);

                        this.infoTipType = "image";
                        this.infoTipObject = absURL;

                        return CSSInfoTip.populateImageInfoTip(infoTip, absURL, repeat);
                    }

                case "fontFamily":
                    return CSSInfoTip.populateFontFamilyInfoTip(infoTip, cssValue.value);
            }

            delete this.infoTipType;
            delete this.infoTipValue;
            delete this.infoTipObject;
        }
    },

    getEditor: function(target, value)
    {
        if (target == this.panelNode
            || Css.hasClass(target, "cssSelector") || Css.hasClass(target, "cssRule")
            || Css.hasClass(target, "cssSheet"))
        {
            if (!this.ruleEditor)
                this.ruleEditor = new CSSRuleEditor(this.document);

            return this.ruleEditor;
        }
        else
        {
            if (!this.editor)
                this.editor = new CSSEditor(this.document);

            return this.editor;
        }
    },

    getDefaultLocation: function()
    {
        try
        {
            var styleSheets = this.context.window.document.styleSheets;
            if (styleSheets.length)
            {
                var sheet = styleSheets[0];
                return (Firebug.filterSystemURLs &&
                    Url.isSystemURL(Css.getURLForStyleSheet(sheet))) ? null : sheet;
            }
        }
        catch (exc)
        {
            if (FBTrace.DBG_LOCATIONS)
                FBTrace.sysout("css.getDefaultLocation FAILS "+exc, exc);
        }
    },

    getObjectLocation: function(styleSheet)
    {
        return Css.getURLForStyleSheet(styleSheet);
    },

    getObjectDescription: function(styleSheet)
    {
        var url = Css.getURLForStyleSheet(styleSheet);
        var instance = Css.getInstanceForStyleSheet(styleSheet);

        var baseDescription = Url.splitURLBase(url);
        if (instance) {
          baseDescription.name = baseDescription.name + " #" + (instance + 1);
        }
        return baseDescription;
    },

    getSourceLink: function(target, rule)
    {
        var element = rule.parentStyleSheet.ownerNode;
        var href = rule.parentStyleSheet.href;  // Null means inline

        // http://code.google.com/p/fbug/issues/detail?id=452
        if (!href)
            href = element.ownerDocument.location.href;

        var line = getRuleLine(rule);
        var instance = Css.getInstanceForStyleSheet(rule.parentStyleSheet);
        var sourceLink = new SourceLink.SourceLink(href, line, "css", rule, instance);

        return sourceLink;
    },

    getTopmostRuleLine: function()
    {
        var panelNode = this.panelNode;
        for (var child = panelNode.firstChild; child; child = child.nextSibling)
        {
            if (child.offsetTop+child.offsetHeight > panelNode.scrollTop)
            {
                var rule = child.repObject;
                if (rule)
                    return {
                        line: getRuleLine(rule),
                        offset: panelNode.scrollTop-child.offsetTop
                    };
            }
        }
        return 0;
    },

    getCurrentLineNumber: function()
    {
        var ruleLine = this.getTopMostRuleLine();
        if (ruleLine)
            return ruleLine.line;
    },

    search: function(text, reverse)
    {
        var curDoc = this.searchCurrentDoc(!Firebug.searchGlobal, text, reverse);
        if (!curDoc && Firebug.searchGlobal)
        {
            return this.searchOtherDocs(text, reverse) ||
                this.searchCurrentDoc(true, text, reverse);
        }
        return curDoc;
    },

    searchOtherDocs: function(text, reverse)
    {
        var scanRE = Firebug.Search.getTestingRegex(text);
        function scanDoc(styleSheet) {
            // we don't care about reverse here as we are just looking for existence,
            // if we do have a result we will handle the reverse logic on display
            for (var i = 0; i < styleSheet.cssRules.length; i++)
            {
                if (scanRE.test(styleSheet.cssRules[i].cssText))
                {
                    return true;
                }
            }
        }

        if (this.navigateToNextDocument(scanDoc, reverse))
        {
            // firefox findService can't find nodes immediatly after insertion
            setTimeout(Obj.bind(this.searchCurrentDoc, this), 0, true, text, reverse);
            return "wraparound";
        }
    },

    searchCurrentDoc: function(wrapSearch, text, reverse)
    {
        var row, sel;

        if (!text)
        {
            delete this.currentSearch;
            this.highlightNode(null);
            this.document.defaultView.getSelection().removeAllRanges();
            return false;
        }

        if (this.currentSearch && text == this.currentSearch.text)
        {
            row = this.currentSearch.findNext(wrapSearch, false, reverse,
                Firebug.Search.isCaseSensitive(text));
        }
        else
        {
            if (this.editing)
            {
                this.currentSearch = new Search.TextSearch(this.stylesheetEditor.box);
                row = this.currentSearch.find(text, reverse, Firebug.Search.isCaseSensitive(text));

                if (row)
                {
                    sel = this.document.defaultView.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(this.currentSearch.range);

                    scrollSelectionIntoView(this);
                    this.highlightNode(row);

                    return true;
                }
                else
                {
                    return false;
                }
            }
            else
            {
                function findRow(node) { return node.nodeType == 1 ? node : node.parentNode; }
                this.currentSearch = new Search.TextSearch(this.panelNode, findRow);
                row = this.currentSearch.find(text, reverse, Firebug.Search.isCaseSensitive(text));
            }
        }

        if (row)
        {
            sel = this.document.defaultView.getSelection();
            sel.removeAllRanges();
            sel.addRange(this.currentSearch.range);

            // Should be replaced by scrollToLine() of sourceBox,
            // though first jumpHighlightFactory() has to be adjusted to
            // remove the current highlighting when called again
            Dom.scrollIntoCenterView(row, this.panelNode);
            this.highlightNode(row.parentNode);

            Events.dispatch(this.fbListeners, "onCSSSearchMatchFound", [this, text, row]);
            return this.currentSearch.wrapped ? "wraparound" : true;
        }
        else
        {
            this.document.defaultView.getSelection().removeAllRanges();
            Events.dispatch(this.fbListeners, "onCSSSearchMatchFound", [this, text, null]);
            return false;
        }
    },

    getSearchOptionsMenuItems: function()
    {
        return [
            Firebug.Search.searchOptionMenu("search.Case_Sensitive", "searchCaseSensitive",
                "search.tip.Case_Sensitive"),
            Firebug.Search.searchOptionMenu("search.Multiple_Files", "searchGlobal",
                "search.tip.Multiple_Files"),
            Firebug.Search.searchOptionMenu("search.Use_Regular_Expression",
                "searchUseRegularExpression", "search.tip.Use_Regular_Expression")
        ];
    },

    getStyleDeclaration: function(cssSelector)
    {
        var cssRule = Dom.getAncestorByClass(cssSelector, "cssRule");
        var cssRules = cssRule.getElementsByClassName("cssPropertyListBox")[0].rule;
        var props = [];

        for (var p in cssRules.props)
        {
            var prop = cssRules.props[p];
            if (!(prop.disabled || prop.overridden))
                props.push(prop.name + ": " + prop.value + prop.important + ";");
        }

        return props;
    },

    copyRuleDeclaration: function(cssSelector)
    {
        var props = this.getStyleDeclaration(cssSelector);
        System.copyToClipboard(cssSelector.textContent + " {" + Str.lineBreak() + "  " +
            props.join(Str.lineBreak() + "  ") + Str.lineBreak() + "}");
    },

    deleteRuleDeclaration: function(cssSelector)
    {
        var searchRule = Firebug.getRepObject(cssSelector) ||
            Firebug.getRepObject(cssSelector.nextSibling);
        var styleSheet = searchRule.parentRule || searchRule.parentStyleSheet;
        var ruleIndex = 0;
        var cssRules = styleSheet.cssRules;
        while (ruleIndex < cssRules.length && searchRule != cssRules[ruleIndex])
            ruleIndex++;

        if (FBTrace.DBG_CSS)
        {
            FBTrace.sysout("css.deleteRuleDeclaration; selector: "+
                Str.cropString(cssSelector.textContent, 100),
                {styleSheet: styleSheet, ruleIndex: ruleIndex});
        }

        Firebug.CSSModule.deleteRule(styleSheet, ruleIndex);

        if (this.context.panelName == "stylesheet")
        {
            var rule = Dom.getAncestorByClass(cssSelector, "cssRule");
            if (rule)
                rule.parentNode.removeChild(rule);
        }
        else
        {
            var sidePanel = Firebug.chrome.getSelectedSidePanel();
            sidePanel.refresh();
        }
    },

    copyStyleDeclaration: function(cssSelector)
    {
        var props = this.getStyleDeclaration(cssSelector);
        System.copyToClipboard(props.join(Str.lineBreak()));
    },

    getRuleId: function(rule)
    {
        var line = Dom.domUtils.getRuleLine(rule);

        // xxxjjb I hope % is invalid in selectortext
        const reQuotes = /['"]/g;
        var ruleId = rule.selectorText.replace(reQuotes,"%")+"/"+line;
        return ruleId;
    }
});

// ********************************************************************************************* //
// CSSEditor

function CSSEditor(doc)
{
    this.initializeInline(doc);
}

CSSEditor.prototype = domplate(Firebug.InlineEditor.prototype,
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
            return CSSPropTag.tag.insertBefore({prop: emptyProp, rule: rule}, target);
        else
            return CSSPropTag.tag.insertAfter({prop: emptyProp, rule: rule}, target);
    },

    saveEdit: function(target, value, previousValue)
    {
        if (FBTrace.DBG_CSS)
            FBTrace.sysout("CSSEditor.saveEdit", arguments);

        var propValue, parsedValue, propName;

        target.innerHTML = Str.escapeForCss(value);

        var row = Dom.getAncestorByClass(target, "cssProp");
        if (Css.hasClass(row, "disabledStyle"))
            Css.toggleClass(row, "disabledStyle");

        var rule = Firebug.getRepObject(target);

        if (rule instanceof window.CSSStyleRule || rule instanceof window.Element)
        {
            if (Css.hasClass(target, "cssPropName"))
            {
  
                if (value && previousValue != value)  // name of property has changed.
                {
                    // Record the original CSS text for the inline case so we can reconstruct at a later
                    // point for diffing purposes
                    var baseText = rule.style ? rule.style.cssText : rule.cssText;
  
                    propValue = Dom.getChildByClass(row, "cssPropValue").textContent;
                    parsedValue = parsePriority(propValue);
  
                    if (FBTrace.DBG_CSS)
                        FBTrace.sysout("CSSEditor.saveEdit : " + previousValue + "->" + value +
                            " = " + propValue);
  
                    if (propValue && propValue != "undefined")
                    {
                        if (FBTrace.DBG_CSS)
                            FBTrace.sysout("CSSEditor.saveEdit : " + previousValue + "->" + value +
                                " = " + propValue);
  
                        if (previousValue)
                            Firebug.CSSModule.removeProperty(rule, previousValue);
  
                        Firebug.CSSModule.setProperty(rule, value, parsedValue.value,
                            parsedValue.priority);
                    }
  
                    Events.dispatch(this.fbListeners, "onCSSPropertyNameChanged", [rule, value,
                        previousValue, baseText]);
                }
                else if (!value)
                {
                    // name of the property has been deleted, so remove the property.
                    Firebug.CSSModule.removeProperty(rule, previousValue);
                }
            }
            else if (Dom.getAncestorByClass(target, "cssPropValue"))
            {
                propName = Dom.getChildByClass(row, "cssPropName").textContent;
                propValue = Dom.getChildByClass(row, "cssPropValue").textContent;
  
                if (FBTrace.DBG_CSS)
                {
                    FBTrace.sysout("CSSEditor.saveEdit propName=propValue: "+propName +
                        " = "+propValue+"\n");
                   // FBTrace.sysout("CSSEditor.saveEdit BEFORE style:",style);
                }
  
                if (value && value != "null")
                {
                    parsedValue = parsePriority(value);
                    Firebug.CSSModule.setProperty(rule, propName, parsedValue.value,
                        parsedValue.priority);
                }
                else if (previousValue && previousValue != "null")
                {
                    Firebug.CSSModule.removeProperty(rule, propName);
                }
            }
  
            if (value)
            {
                var saveSuccess = !!rule.style.getPropertyValue(propName || value);
                if(!saveSuccess && !propName)
                {
                    propName = value.replace(/-./g, function(match)
                    {
                        return match[1].toUpperCase()
                    });
    
                    if (propName in rule.style || propName == "float")
                        saveSuccess = "almost";
                }
    
                this.box.setAttribute("saveSuccess", saveSuccess);
            }
            else
            {
                this.box.removeAttribute("saveSuccess");
            }
        }
        else if (rule instanceof window.CSSImportRule && Css.hasClass(target, "cssMediaQuery"))
        {
            if (FBTrace.DBG_CSS)
            {
                FBTrace.sysout("CSSEditor.saveEdit: @import media query: " +
                    previousValue + "->" + value);
            }

            rule.media.mediaText = value;

            // Workaround to apply the media query changes
            rule.parentStyleSheet.disabled = true;
            rule.parentStyleSheet.disabled = false;

            row = Dom.getAncestorByClass(target, "importRule");
            row.getElementsByClassName("separator").item(0).innerHTML = 
                value == "" ? "" : "&nbsp;";
        }
        else if (rule instanceof window.CSSCharsetRule)
        {
            if (FBTrace.DBG_CSS)
                FBTrace.sysout("CSSEditor.saveEdit: @charset: " + previousValue + "->" + value);

            rule.encoding = value;
        }

        Firebug.Inspector.repaint();

        this.panel.markChange(this.panel.name == "stylesheet");

        if (FBTrace.DBG_CSS)
            FBTrace.sysout("CSSEditor.saveEdit (ending) " + this.panel.name, value);
    },

    advanceToNext: function(target, charCode)
    {
        if (charCode == 58 /*":"*/ && Css.hasClass(target, "cssPropName"))
        {
            return true;
        }
        else if (charCode == 59 /*";"*/ && Css.hasClass(target, "cssPropValue"))
        {
            var cssValue = Firebug.CSSModule.parseCSSValue(this.input.value, this.input.selectionStart);
            // Simple test, if we are inside a string (see issue 4543)
            var isValueInString = (cssValue.value.indexOf("\"") != -1);

            return !isValueInString;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    getAutoCompleteRange: function(value, offset)
    {
        if (!Css.hasClass(this.target, "cssPropValue"))
            return {start: 0, end: value.length};

        var propRow = Dom.getAncestorByClass(this.target, "cssProp");
        var propName = Dom.getChildByClass(propRow, "cssPropName").textContent.toLowerCase();
        if (propName == "font" || propName == "font-family")
            return Firebug.CSSModule.parseCSSFontFamilyValue(value, offset, propName);
        else
            return Firebug.CSSModule.parseCSSValue(value, offset);
    },

    getAutoCompleteList: function(preExpr, expr, postExpr, range, cycle)
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
            return Css.getCSSPropertyNames(nodeType);
        }
        else
        {
            if (expr.charAt(0) === "!")
                return ["!important"];

            var row = Dom.getAncestorByClass(this.target, "cssProp");
            var propName = Dom.getChildByClass(row, "cssPropName").textContent;
            var nodeType = Xml.getElementSimpleType(Firebug.getRepObject(this.target));

            var keywords;
            if (range.type === "url")
            {
                // We can't complete urls yet.
                return [];
            }
            else if (range.type === "fontFamily")
            {
                keywords = Css.cssKeywords["fontFamily"].slice();
                if (this.panel && this.panel.context)
                {
                    // Add the fonts used in this context (they might be inaccessible
                    // for this element, but probably aren't).
                    var fonts = Fonts.getFontsUsedInContext(this.panel.context), ar = [];
                    for (var i = 0; i < fonts.length; i++)
                        ar.push(fonts[i].CSSFamilyName);
                    keywords = Arr.merge(keywords, ar);
                }

                var q = expr.charAt(0), isQuoted = (q === '"' || q === "'");
                if (!isQuoted)
                {
                    // Default to ' quotes, unless " occurs somewhere.
                    q = (/"/.test(preExpr + postExpr) ? '"' : "'");
                }

                // Don't complete '.
                if (expr.length <= 1 && isQuoted)
                    return [];

                // When completing, quote fonts if the input is quoted; when
                // cycling, quote them instead in the way the user seems to
                // expect to have them quoted.
                var reSimple = /^[a-z][a-z0-9-]*$/i;
                var isComplex = !reSimple.test(expr.replace(/^['"]?|['"]?$/g, ""));
                var quote = function(str)
                {
                    if (!cycle || isComplex !== isQuoted)
                        return (isQuoted ? q + str + q : str);
                    else
                        return (reSimple.test(str) ? str : q + str + q);
                };

                keywords = keywords.slice();
                for (var i = 0; i < keywords.length; ++i)
                {
                    // Treat values starting with capital letters as font names
                    // that can be quoted.
                    var k = keywords[i];
                    if (k.charAt(0).toLowerCase() !== k.charAt(0))
                        keywords[i] = quote(k);
                }
            }
            else
            {
                var lowerProp = propName.toLowerCase(), avoid;
                if (["background", "border", "font"].indexOf(lowerProp) !== -1)
                {
                    if (cycle)
                    {
                        // Cycle only within the same category, if possible.
                        var cat = Css.getCSSShorthandCategory(nodeType, lowerProp, expr);
                        if (cat)
                            return (cat in Css.cssKeywords ? Css.cssKeywords[cat] : [cat]);
                    }
                    else
                    {
                        // Avoid repeated properties. We assume the values to be solely
                        // space-separated tokens, within a comma-separated part (like
                        // for CSS3 multiple backgrounds). This is absolutely wrong, but
                        // good enough in practice because non-tokens for which it fails
                        // likely aren't in any category.
                        // "background-position" and "background-repeat" values can occur
                        // twice, so they are special-cased.
                        avoid = [];
                        var preTokens = preExpr.split(",").reverse()[0].split(" ");
                        var postTokens = postExpr.split(",")[0].split(" ");
                        var tokens = preTokens.concat(postTokens);
                        for (var i = 0; i < tokens.length; ++i)
                        {
                            var cat = Css.getCSSShorthandCategory(nodeType, lowerProp, tokens[i]);
                            if (cat && cat !== "position" && cat !== "bgRepeat")
                                avoid.push(cat);
                        }
                    }
                }
                keywords = Css.getCSSKeywordsByProperty(nodeType, propName, avoid);
            }

            // Add the magic inherit property, if it's sufficiently alone.
            if (!preExpr)
                keywords = keywords.concat(["inherit"]);
            return keywords;
        }
    },

    getAutoCompletePropSeparator: function(range, expr, prefixOf)
    {
        if (!Css.hasClass(this.target, "cssPropValue"))
            return null;

        // For non-multi-valued properties, fail (expanding 'background-repeat: repeat'
        // into 'no-repeat' should work).
        var row = Dom.getAncestorByClass(this.target, "cssProp");
        var propName = Dom.getChildByClass(row, "cssPropName").textContent;
        if (!Css.multiValuedProperties.hasOwnProperty(propName))
            return null;

        if (range.type === "fontFamily")
            return ",";
        return " ";
    },

    doIncrementValue: function(value, amt, offset, offsetEnd)
    {
        var propName = null;
        if (Css.hasClass(this.target, "cssPropValue"))
        {
            var propRow = Dom.getAncestorByClass(this.target, "cssProp");
            propName = Dom.getChildByClass(propRow, "cssPropName").textContent;
        }

        var range = Firebug.CSSModule.parseCSSValue(value, offset);
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

            return Firebug.InlineEditor.prototype.doIncrementValue
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

        // Remap the increments from [0.1, 1, 10] to [1, 1, 16].
        if (-1 < amt && amt < 1)
            amt = (amt < 0 ? -1 : 1);
        if (Math.abs(amt) === 10)
            amt = (amt < 0 ? -16 : 16);

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
// CSSRuleEditor

function CSSRuleEditor(doc)
{
    this.initializeInline(doc);
}

CSSRuleEditor.uniquifier = 0;
CSSRuleEditor.prototype = domplate(Firebug.InlineEditor.prototype,
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
            return CSSStyleRuleTag.tag.insertBefore({rule: emptyRule}, target);
        else
            return CSSStyleRuleTag.tag.insertAfter({rule: emptyRule}, target);
    },

    saveEdit: function(target, value, previousValue)
    {
        if (FBTrace.DBG_CSS)
            FBTrace.sysout("CSSRuleEditor.saveEdit: '" + value + "'  '" + previousValue +
                "'", target);

        target.innerHTML = Str.escapeForCss(value);

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
            if(!styleSheet)
                return;

            var cssRules = styleSheet.cssRules;
            for (ruleIndex=0; ruleIndex<cssRules.length && searchRule!=cssRules[ruleIndex];
                ruleIndex++)
            {
            }

            if (rule)
                oldRule = searchRule;
            else
                ruleIndex++;
        }
        else
        {
            if (this.panel.name != "stylesheet")
                return;

            var styleSheet = this.panel.location;//this must be stylesheet panel
            if (!styleSheet)
            {
                // If there is no stylesheet on the page we need to create a temporary one,
                // in order to make a place where to put (custom) user provided rules.
                // If this code would be in this.getDefaultLocation the default stylesheet
                // would be created automatically for all pages with not styles, which
                // could be damaging for special pages (see eg issue 2440)
                // At this moment the user edits the styles so some CSS changes on the page
                // are expected.
                var doc = this.panel.context.window.document;
                var style = Css.appendStylesheet(doc, "chrome://firebug/default-stylesheet.css");
                Wrapper.getContentView(style).defaultStylesheet = true;
                this.panel.location = styleSheet = style.sheet;
            }

            styleSheet = styleSheet.editStyleSheet ? styleSheet.editStyleSheet.sheet : styleSheet;
            cssRules = styleSheet.cssRules;
            ruleIndex = cssRules.length;
        }

        // Delete in all cases except for new add
        // We want to do this before the insert to ease change tracking
        if (oldRule)
        {
            Firebug.CSSModule.deleteRule(styleSheet, ruleIndex);
        }

        // Firefox does not follow the spec for the update selector text case.
        // When attempting to update the value, firefox will silently fail.
        // See https://bugzilla.mozilla.org/show_bug.cgi?id=37468 for the quite
        // old discussion of this bug.
        // As a result we need to recreate the style every time the selector
        // changes.
        if (value)
        {
            var cssText = [ value, "{", ];
            var props = row.getElementsByClassName("cssProp");
            for (var i = 0; i < props.length; i++)
            {
                var propEl = props[i];
                if (!Css.hasClass(propEl, "disabledStyle"))
                {
                    cssText.push(Dom.getChildByClass(propEl, "cssPropName").textContent);
                    cssText.push(":");
                    cssText.push(Dom.getChildByClass(propEl, "cssPropValue").textContent);
                    cssText.push(";");
                }
            }

            cssText.push("}");
            cssText = cssText.join("");

            try
            {
                var insertLoc = Firebug.CSSModule.insertRule(styleSheet, cssText, ruleIndex);
                rule = cssRules[insertLoc];
                ruleIndex++;

                var saveSuccess = this.panel.name != "css";
                if (!saveSuccess)
                    saveSuccess =(this.panel.selection &&
                        this.panel.selection.mozMatchesSelector(value))? true: 'almost';

                this.box.setAttribute('saveSuccess',saveSuccess);
            }
            catch (err)
            {
                if (FBTrace.DBG_CSS || FBTrace.DBG_ERRORS)
                    FBTrace.sysout("CSS Insert Error: "+err, err);

                target.innerHTML = Str.escapeForCss(previousValue);
                // create dummy rule to be able to recover from error
                var insertLoc = Firebug.CSSModule.insertRule(styleSheet,
                    'selectorSavingError{}', ruleIndex);
                rule = cssRules[insertLoc];

                this.box.setAttribute('saveSuccess',false);

                row.repObject = rule;
                return;
            }
        }
        else
        {
            rule = undefined;
        }

        // Update the rep object
        row.repObject = rule;
        if (!oldRule)
        {
            // Who knows what the domutils will return for rule line
            // for a recently created rule. To be safe we just generate
            // a unique value as this is only used as an internal key.
            var ruleId = "new/"+value+"/"+(++CSSRuleEditor.uniquifier);
            row.setAttribute("ruleId", ruleId);
        }

        this.panel.markChange(this.panel.name == "stylesheet");
    },

    getAutoCompleteRange: function(value, offset)
    {
        if (!Css.hasClass(this.target, "cssSelector"))
            return;

        // Find the word part of an identifier.
        var reIdent = /[-_a-zA-Z0-9]*/;
        var rbefore = Str.reverseString(value.substr(0, offset));
        var after = value.substr(offset);
        var start = offset - reIdent.exec(rbefore)[0].length;
        var end = offset + reIdent.exec(after)[0].length;

        // Expand it to include '.', '#', ':', or '::'.
        if (start > 0 && ".#:".indexOf(value.charAt(start-1)) !== -1)
        {
            --start;
            if (start > 0 && value.substr(start-1, 2) === "::")
                --start;
        }
        return {start: start, end: end};
    },

    getAutoCompleteList: function(preExpr, expr, postExpr, range, cycle, context, out)
    {
        if (!Css.hasClass(this.target, "cssSelector"))
            return [];

        // Don't support attribute selectors, for now.
        if (preExpr.lastIndexOf('[') > preExpr.lastIndexOf(']'))
            return [];

        var includeTagNames = true;
        var includeIds = true;
        var includeClasses = true;
        var includePseudoClasses = true;
        var includePseudoElements = true;

        if (expr.length > 0)
        {
            includeTagNames = includeClasses = includeIds =
                includePseudoClasses = includePseudoElements = false;
            if (Str.hasPrefix(expr, "::"))
                includePseudoElements = true;
            else if (expr.charAt(0) === ":")
                includePseudoClasses = true;
            else if (expr.charAt(0) === "#")
                includeIds = true;
            else if (expr.charAt(0) === ".")
                includeClasses = true;
            else
                includeTagNames = true;
        }
        if (preExpr.length > 0 && reSelectorChar.test(preExpr.slice(-1)))
            includeTagNames = false;

        var ret = [];

        if (includeTagNames || includeIds || includeClasses)
        {
            // Traverse the DOM to get the used ids/classes/tag names that
            // are relevant as continuations.
            // (Tag names could be hard-coded, but finding which ones are
            // actually used hides annoying things like 'b'/'i' when they
            // are not used, and works in other contexts than HTML.)
            // This isn't actually that bad, performance-wise.
            var doc = context.window.document, els;
            if (preExpr && " >+~".indexOf(preExpr.slice(-1)) === -1)
            {
                try
                {
                    var preSelector = preExpr.split(",").reverse()[0];
                    els = doc.querySelectorAll(preSelector);
                }
                catch (exc)
                {
                    if (FBTrace.DBG_CSS)
                        FBTrace.sysout("Invalid previous selector part \"" + preSelector + "\"", exc);
                }
            }
            if (!els)
                els = doc.getElementsByTagName("*");
            els = [].slice.call(els);

            if (includeTagNames)
            {
                var tagMap = {};
                els.forEach(function(e)
                {
                    tagMap[e.localName] = 1;
                });
                ret.push.apply(ret, Object.keys(tagMap));
            }

            if (includeIds)
            {
                var ids = [];
                els.forEach(function(e)
                {
                    if (e.id)
                        ids.push(e.id);
                });
                ids = Arr.merge(ids, []);
                ret.push.apply(ret, ids.map(function(cl)
                {
                    return "#" + cl;
                }));
            }

            if (includeClasses)
            {
                var clCombinationMap = {}, classes = [];
                els.forEach(function(e)
                {
                    var cl = e.className;
                    if (cl && !((","+cl) in clCombinationMap))
                    {
                        clCombinationMap[","+cl] = 1;
                        classes.push.apply(classes, e.classList);
                    }
                });
                classes = Arr.merge(classes, []);
                ret.push.apply(ret, classes.map(function(cl)
                {
                    return "." + cl;
                }));
            }
        }

        if (includePseudoClasses)
        {
            // Add the pseudo-class-looking :before, :after.
            ret.push(
                ":after",
                ":before"
            );

            ret.push.apply(ret, Css.pseudoClasses);
        }

        if (includePseudoElements)
        {
            ret.push.apply(ret, Css.pseudoElements);
        }

        // Don't suggest things that are already included (by way of totally-
        // incorrect-but-probably-good-enough logic).
        var rev = Str.reverseString(preExpr);
        var partInd = rev.search(/[, >+~]/);
        var lastPart = (partInd === -1 ? rev : rev.substr(0, partInd));
        lastPart = Str.reverseString(lastPart);
        if (lastPart !== "")
        {
            ret = ret.filter(function(str)
            {
                var ind = lastPart.indexOf(str);
                if (ind === -1)
                    return true;
                var before = ind-1, after = ind+str.length;
                var re = reSelectorChar;
                if (before >= 0 && re.test(str.charAt(0)) && re.test(lastPart.charAt(before)))
                    return true;
                if (after < lastPart.length && re.test(lastPart.charAt(after)))
                    return true;
                return false;
            });
        }

        // Don't suggest internal Firebug things.
        var reInternal = /^[.#]firebug[A-Z]/;
        ret = ret.filter(function(str)
        {
            return !reInternal.test(str);
        });

        if (ret.indexOf(":hover") !== -1)
            out.suggestion = ":hover";

        return ret.sort();
    },

    getAutoCompletePropSeparator: function(range, expr, prefixOf)
    {
        if (!Css.hasClass(this.target, "cssSelector"))
            return null;

        // For e.g. 'd|span', expand to a descendant selector; otherwise assume
        // that this is part of the same selector part.
        return (reSelectorChar.test(prefixOf.charAt(0)) ? " " : "");
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
// StyleSheetEditor

/**
 * StyleSheetEditor represents an inline editor and is used when editing CSS
 * within the CSS panel.
 */
function StyleSheetEditor(doc)
{
    this.box = this.tag.replace({}, doc, this);
    this.input = this.box.firstChild;
}

StyleSheetEditor.prototype = domplate(Firebug.BaseEditor,
{
    multiLine: true,

    tag: DIV(
        TEXTAREA({"class": "styleSheetEditor fullPanelEditor", oninput: "$onInput"})
    ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getValue: function()
    {
        return this.input.value;
    },

    setValue: function(value)
    {
        return this.input.value = value;
    },

    show: function(target, panel, value, textSize)
    {
        this.target = target;
        this.panel = panel;

        this.panel.panelNode.appendChild(this.box);

        this.input.value = value;
        this.input.focus();

        // match CSSModule.getEditorOptionKey
        var command = Firebug.chrome.$("cmd_togglecssEditMode");
        command.setAttribute("checked", true);
    },

    hide: function()
    {
        var command = Firebug.chrome.$("cmd_togglecssEditMode");
        command.setAttribute("checked", false);

        if (this.box.parentNode == this.panel.panelNode)
            this.panel.panelNode.removeChild(this.box);

        delete this.target;
        delete this.panel;
        delete this.styleSheet;
    },

    saveEdit: function(target, value, previousValue)
    {
        if (FBTrace.DBG_CSS)
            FBTrace.sysout("StyleSheetEditor.saveEdit", arguments);

        Firebug.CSSModule.freeEdit(this.styleSheet, value);
    },

    beginEditing: function()
    {
        if (FBTrace.DBG_CSS)
            FBTrace.sysout("StyleSheetEditor.beginEditing", arguments);

        this.editing = true;
    },

    endEditing: function()
    {
        if (FBTrace.DBG_CSS)
            FBTrace.sysout("StyleSheetEditor.endEditing", arguments);

        this.editing = false;
        this.panel.refresh();
        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onInput: function()
    {
        Firebug.Editor.update();
    },

    scrollToLine: function(line, offset)
    {
        this.startMeasuring(this.input);
        var lineHeight = this.measureText().height;
        this.stopMeasuring();

        this.input.scrollTop = (line * lineHeight) + offset;
    }
});

Firebug.StyleSheetEditor = StyleSheetEditor;

// ********************************************************************************************* //

Firebug.CSSDirtyListener = function(context)
{
}

Firebug.CSSDirtyListener.isDirty = function(styleSheet, context)
{
    return (styleSheet.fbDirty == true);
}

Firebug.CSSDirtyListener.prototype =
{
    markSheetDirty: function(styleSheet)
    {
        if (!styleSheet && FBTrace.DBG_ERRORS)
        {
            FBTrace.sysout("css; CSSDirtyListener markSheetDirty; styleSheet == NULL");
            return;
        }

        styleSheet.fbDirty = true;

        if (FBTrace.DBG_CSS)
            FBTrace.sysout("CSSDirtyListener markSheetDirty " + styleSheet.href, styleSheet);
    },

    onCSSInsertRule: function(styleSheet, cssText, ruleIndex)
    {
        this.markSheetDirty(styleSheet);
    },

    onCSSDeleteRule: function(styleSheet, ruleIndex)
    {
        this.markSheetDirty(styleSheet);
    },

    onCSSSetProperty: function(style, propName, propValue, propPriority, prevValue,
        prevPriority, rule, baseText)
    {
        var styleSheet = rule.parentStyleSheet;
        this.markSheetDirty(styleSheet);
    },

    onCSSRemoveProperty: function(style, propName, prevValue, prevPriority, rule, baseText)
    {
        var styleSheet = rule.parentStyleSheet;
        this.markSheetDirty(styleSheet);
    }
};

// ********************************************************************************************* //
// Local Helpers

function parsePriority(value)
{
    var rePriority = /(.*?)\s*(!important)?$/;
    var m = rePriority.exec(value);
    var propValue = m ? m[1] : "";
    var priority = m && m[2] ? "important" : "";
    return {value: propValue, priority: priority};
}

function getRuleLine(rule)
{
    // TODO return closest guess if rule isn't CSSStyleRule
    // and keep track of edited rule lines
    try
    {
        return Dom.domUtils.getRuleLine(rule);
    }
    catch(e)
    {

    }
    return 0;
}

function getTopmostRuleLine(panelNode)
{
    for (var child = panelNode.firstChild; child; child = child.nextSibling)
    {
        if (child.offsetTop+child.offsetHeight > panelNode.scrollTop)
        {
            var rule = child.repObject;
            if (rule)
                return {
                    line: getRuleLine(rule),
                    offset: panelNode.scrollTop-child.offsetTop
                };
        }
    }
    return 0;
}

function getOriginalStyleSheetCSS(sheet, context)
{
    if (sheet.ownerNode instanceof window.HTMLStyleElement)
    {
        return sheet.ownerNode.innerHTML;
    }
    else
    {
        // In the case, that there are no rules, the cache will return a message
        // to reload the source (see issue 4251)
        return sheet.cssRules.length != 0 ? context.sourceCache.load(sheet.href).join("") : "";
    }
}

function getStyleSheetCSS(sheet, context)
{
    function beautify(css, indent)
    {
        var indent='\n'+Array(indent+1).join(' ');
        var i=css.indexOf('{');
        var match=css.substr(i+1).match(/(?:[^;\(]*(?:\([^\)]*?\))?[^;\(]*)*;?/g);
        match.pop();
        match.pop();
        return css.substring(0, i+1) + indent
                + match.sort().join(indent) + '\n}';
    }

    var cssRules = sheet.cssRules, css=[];
    for(var i = 0; i < cssRules.length; i++)
    {
        var rule = cssRules[i];
        if (rule instanceof window.CSSStyleRule)
            css.push(beautify(rule.cssText, 4));
        else
            css.push(rule.cssText);
    }

    return Css.rgbToHex(css.join('\n\n')) + '\n';
}

function scrollSelectionIntoView(panel)
{
    var selCon = getSelectionController(panel);
    selCon.scrollSelectionIntoView(
        Ci.nsISelectionController.SELECTION_NORMAL,
        Ci.nsISelectionController.SELECTION_FOCUS_REGION, true);
}

function getSelectionController(panel)
{
    var browser = Firebug.chrome.getPanelBrowser(panel);
    return browser.docShell.QueryInterface(Ci.nsIInterfaceRequestor)
        .getInterface(Ci.nsISelectionDisplay)
        .QueryInterface(Ci.nsISelectionController);
}

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(Firebug.CSSStyleSheetPanel);

return Firebug.CSSStyleSheetPanel;

// ********************************************************************************************* //
}});
