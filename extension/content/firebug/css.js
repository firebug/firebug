/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const nsIDOMCSSStyleRule = Ci.nsIDOMCSSStyleRule;
const nsIInterfaceRequestor = Ci.nsIInterfaceRequestor;
const nsISelectionDisplay = Ci.nsISelectionDisplay;
const nsISelectionController = Ci.nsISelectionController;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

var domUtils = null;

var CSSPropTag =
    DIV({class: "cssProp editGroup focusRow", $disabledStyle: "$prop.disabled", role : 'option'},
        SPAN({class: "cssPropName editable"}, "$prop.name"),
        SPAN({class: "cssColon"}, ":"),
        SPAN({class: "cssPropValue editable"}, "$prop.value$prop.important"),
        SPAN({class: "cssSemi"}, ";")
    );

var CSSRuleTag =
    TAG("$rule.tag", {rule: "$rule"});

var CSSImportRuleTag =
    DIV({class: "cssRule insertInto focusRow importRule", _repObject: "$rule.rule"},
        "@import &quot;",
        A({class: "objectLink", _repObject: "$rule.rule.styleSheet"}, "$rule.rule.href"),
        "&quot;;"
    );

var CSSStyleRuleTag =
    DIV({class: "cssRule insertInto", _repObject: "$rule.rule.style",
            "ruleId": "$rule.id", role : 'presentation'},
        DIV({class: "cssHead focusRow", role : 'listitem'},
            SPAN({class: "cssSelector"}, "$rule.selector"), " {"
        ),
        DIV({role : 'group'},
            DIV({class : "cssPropertyListBox", role : 'listbox'},
                FOR("prop", "$rule.props",
                    CSSPropTag
                )
            )
        ),    
        DIV({class: "editable insertBefore", role:"presentation"}, "}")
    );

const reSplitCSS =  /(url\("?[^"\)]+?"?\))|(rgb\(.*?\))|(#[\dA-Fa-f]+)|(-?\d+(\.\d+)?(%|[a-z]{1,2})?)|([^,\s]+)|"(.*?)"/;

const reURL = /url\("?([^"\)]+)?"?\)/;

const reRepeat = /no-repeat|repeat-x|repeat-y|repeat/;

const sothinkInstalled = !!$("swfcatcherKey_sidebar");
const styleGroups =
{
    text: [
        "font-family",
        "font-size",
        "font-weight",
        "font-style",
        "color",
        "text-transform",
        "text-decoration",
        "letter-spacing",
        "word-spacing",
        "line-height",
        "text-align",
        "vertical-align",
        "direction",
        "column-count",
        "column-gap",
        "column-width"
    ],

    background: [
        "background-color",
        "background-image",
        "background-repeat",
        "background-position",
        "background-attachment",
        "opacity"
    ],

    box: [
        "width",
        "height",
        "top",
        "right",
        "bottom",
        "left",
        "margin-top",
        "margin-right",
        "margin-bottom",
        "margin-left",
        "padding-top",
        "padding-right",
        "padding-bottom",
        "padding-left",
        "border-top-width",
        "border-right-width",
        "border-bottom-width",
        "border-left-width",
        "border-top-color",
        "border-right-color",
        "border-bottom-color",
        "border-left-color",
        "border-top-style",
        "border-right-style",
        "border-bottom-style",
        "border-left-style",
        "-moz-border-top-radius",
        "-moz-border-right-radius",
        "-moz-border-bottom-radius",
        "-moz-border-left-radius",
        "outline-top-width",
        "outline-right-width",
        "outline-bottom-width",
        "outline-left-width",
        "outline-top-color",
        "outline-right-color",
        "outline-bottom-color",
        "outline-left-color",
        "outline-top-style",
        "outline-right-style",
        "outline-bottom-style",
        "outline-left-style"
    ],

    layout: [
        "position",
        "display",
        "visibility",
        "z-index",
        "overflow-x",  // http://www.w3.org/TR/2002/WD-css3-box-20021024/#overflow
        "overflow-y",
        "overflow-clip",
        "white-space",
        "clip",
        "float",
        "clear",
        "-moz-box-sizing"
    ],

    other: [
        "cursor",
        "list-style-image",
        "list-style-position",
        "list-style-type",
        "marker-offset",
        "user-focus",
        "user-select",
        "user-modify",
        "user-input"
    ]
};

Firebug.CSSModule = extend(Firebug.Module, {
    setProperty: function(style, propName, propValue, propPriority) {
        var prevValue = style.getPropertyValue(propName);
        var prevPriority = style.getPropertyPriority(propName);

        // XXXjoe Gecko bug workaround: Just changing priority doesn't have any effect
        // unless we remove the property first
        style.removeProperty(propName);

        style.setProperty(propName, propValue, propPriority);

        if (propName) {
            dispatch(this.fbListeners, "onCSSSetProperty", [style, propName, propValue, propPriority, prevValue, prevPriority]);
        }
    },
    removeProperty: function(style, propName) {
        var prevValue = style.getPropertyValue(propName);
        var prevPriority = style.getPropertyPriority(propName);

        style.removeProperty(propName);

        if (propName) {
            dispatch(this.fbListeners, "onCSSRemoveProperty", [style, propName, prevValue, prevPriority]);
        }
    }
});

// ************************************************************************************************

Firebug.CSSStyleSheetPanel = function() {}

Firebug.CSSStyleSheetPanel.prototype = extend(Firebug.SourceBoxPanel,
{
    template: domplate(
    {
        tag:
            FOR("rule", "$rules",
                CSSRuleTag
            )
    }),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    refresh: function()
    {
        if (this.location)
            this.updateLocation(this.location);
        else if (this.selection)
            this.updateSelection(this.selection);
    },

    toggleEditing: function()
    {
        if (!this.stylesheetEditor)
            this.stylesheetEditor = new StyleSheetEditor(this.document);

        if (this.editing)
            Firebug.Editor.stopEditing();
        else
        {
            if (!this.location)
                return;

            var styleSheet = this.location.editStyleSheet
                ? this.location.editStyleSheet.sheet
                : this.location;

            var css = getStyleSheetCSS(styleSheet, this.context);
            //var topmost = getTopmostRuleLine(this.panelNode);

            this.stylesheetEditor.styleSheet = this.location;
            Firebug.Editor.startEditing(this.panelNode, css, this.stylesheetEditor);
            //this.stylesheetEditor.scrollToLine(topmost.line, topmost.offset);
        }
    },

    getStylesheetURL: function(style)
    {
        if (this.location.href)
            return this.location.href;
        else
            return this.context.window.location.href;
    },

    getRuleByLine: function(styleSheet, line)
    {
        if (!domUtils)
            return null;

        var cssRules = styleSheet.cssRules;
        for (var i = 0; i < cssRules.length; ++i)
        {
            var rule = cssRules[i];
            if (rule instanceof CSSStyleRule)
            {
                var ruleLine = domUtils.getRuleLine(rule);
                if (ruleLine >= line)
                    return rule;
            }
        }
    },

    highlightRule: function(rule)
    {
        var ruleElement = Firebug.getElementByRepObject(this.panelNode, rule.style);
        if (ruleElement)
        {
            scrollIntoCenterView(ruleElement, this.panelNode);
            setClassTimed(ruleElement, "jumpHighlight", this.context);
        }
    },

    getStyleSheetRules: function(context, styleSheet)
    {
        function appendRules(cssRules)
        {
            for (var i = 0; i < cssRules.length; ++i)
            {
                var rule = cssRules[i];
                if (rule instanceof CSSStyleRule)
                {
                    var props = this.getRuleProperties(context, rule);
                    var line = domUtils.getRuleLine(rule);
                    var ruleId = rule.selectorText+"/"+line;
                    rules.push({tag: CSSStyleRuleTag, rule: rule, id: ruleId,
                                selector: rule.selectorText, props: props});
                }
                else if (rule instanceof CSSImportRule)
                    rules.push({tag: CSSImportRuleTag, rule: rule});
                else if (rule instanceof CSSMediaRule)
                    appendRules.apply(this, [rule.cssRules]);
            }
        }

        var rules = [];
        appendRules.apply(this, [styleSheet.cssRules]);
        return rules;
    },

    getRuleProperties: function(context, rule, inheritMode)
    {
        var props = [];

        var ruleRE = /\{(.*?)\}$/;
        var m = ruleRE.exec(rule.cssText);
        if (!m)
            return props;

            var lines = m[1].match(/(?:[^;\(]*(?:\([^\)]*?\))?[^;\(]*)*;?/g);
            var propRE = /\s*([^:\s]*)\s*:\s*(.*?)\s*(! important)?;?$/;
            var line,i=0;
            while(line=lines[i++]){
                m = propRE.exec(line);
                if(!m)
                    continue;
                //var name = m[1], value = m[2], important = !!m[3];
                if (m[2])
                    this.addProperty(m[1], m[2], !!m[3], false, inheritMode, props);
            };

        line = domUtils.getRuleLine(rule);
        var ruleId = rule.selectorText+"/"+line;
        this.addOldProperties(context, ruleId, inheritMode, props);
        sortProperties(props);

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
        if (inheritMode && !inheritedStyleNames[name])
            return;

        name = this.translateName(name, value);
        if (name)
        {
            value = stripUnits(rgbToHex(value));
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    editElementStyle: function()
    {
        var elementStyle = this.selection.style;
        var rulesBox = this.panelNode.firstChild;
        var styleRuleBox = Firebug.getElementByRepObject(rulesBox, elementStyle);
        if (styleRuleBox)
            Firebug.Editor.insertRowForObject(styleRuleBox);
        else
        {
            var rule = {rule: this.selection, inherited: false, selector: "element.style", props: []};
            var styleRuleBox = this.template.ruleTag.replace({rule: rule}, this.document);

            if (rulesBox.firstChild)
                rulesBox.insertBefore(styleRuleBox, rulesBox.firstChild);
            else
                rulesBox.appendChild(styleRuleBox);

            Firebug.Editor.insertRowForObject(styleRuleBox);
        }
    },

    insertPropertyRow: function(row)
    {
        Firebug.Editor.insertRowForObject(row);
    },

    editPropertyRow: function(row)
    {
        var propValueBox = getChildByClass(row, "cssPropValue");
        Firebug.Editor.startEditing(propValueBox);
    },

    deletePropertyRow: function(row)
    {
        var style = Firebug.getRepObject(row);
        var propName = getChildByClass(row, "cssPropName").textContent;
        Firebug.CSSModule.removeProperty(style, propName);

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

        row.parentNode.removeChild(row);

        this.markChange(this.name == "stylesheet");
    },

    disablePropertyRow: function(row)
    {
        toggleClass(row, "disabledStyle");
        
        var style = Firebug.getRepObject(row);
        var propName = getChildByClass(row, "cssPropName").textContent;

        if (!this.context.selectorMap)
            this.context.selectorMap = {};

        // XXXjoe Generate unique key for elements too
        var ruleId = Firebug.getRepNode(row).getAttribute("ruleId");
        if (!(this.context.selectorMap.hasOwnProperty(ruleId)))
            this.context.selectorMap[ruleId] = [];

        var map = this.context.selectorMap[ruleId];
        var propValue = getChildByClass(row, "cssPropValue").textContent;
        var parsedValue = parsePriority(propValue);
        if (hasClass(row, "disabledStyle"))
        {
            Firebug.CSSModule.removeProperty(style, propName);

            map.push({"name": propName, "value": parsedValue.value,
                "important": parsedValue.priority});
        }
        else
        {
            Firebug.CSSModule.setProperty(style, propName, parsedValue.value, parsedValue.priority);

            var index = findPropByName(map, propName);
            map.splice(index, 1);
        }

        this.markChange(this.name == "stylesheet");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    onMouseDown: function(event)
    {
        // XXjoe Hack to only allow clicking on the checkbox
        if (!isLeftClick(event) || event.clientX > 20)
            return;

        if (hasClass(event.target, "textEditor"))
            return;

        var row = getAncestorByClass(event.target, "cssProp");
        if (row)
        {
            this.disablePropertyRow(row);
            cancelEvent(event);
        }
    },

    onClick: function(event)
    {
        if (!isLeftClick(event) || event.clientX <= 20 || event.detail != 2)
            return;

        var row = getAncestorByClass(event.target, "cssRule");
        if (row && !getAncestorByClass(event.target, "cssPropName")
            && !getAncestorByClass(event.target, "cssPropValue"))
        {
            this.insertPropertyRow(row);
            cancelEvent(event);
        }
    },


    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Panel

    name: "stylesheet",
    parentPanel: null,
    searchable: true,
    dependents: ["css", "stylesheet", "dom", "domSide", "layout"],

    initialize: function()
    {
        if (!domUtils)
        {
            try {
                domUtils = CCSV("@mozilla.org/inspector/dom-utils;1", "inIDOMUtils");
            } catch (exc) {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("@mozilla.org/inspector/dom-utils;1 FAILED to load: "+exc, exc);
            }
        }
        this.onMouseDown = bind(this.onMouseDown, this);
        this.onClick = bind(this.onClick, this);

        Firebug.SourceBoxPanel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        state.scrollTop = this.panelNode.scrollTop ? this.panelNode.scrollTop : this.lastScrollTop;

        persistObjects(this, state);

        Firebug.Editor.stopEditing();
        Firebug.Panel.destroy.apply(this, arguments);
    },

    initializeNode: function(oldPanelNode)
    {
        this.panelNode.addEventListener("mousedown", this.onMouseDown, false);
        this.panelNode.addEventListener("click", this.onClick, false);
        Firebug.SourceBoxPanel.initializeNode.apply(this, arguments);
        dispatch([Firebug.A11yModel], 'onInitializeNode', [this, 'css']);
    },

    destroyNode: function()
    {
        this.panelNode.removeEventListener("mousedown", this.onMouseDown, false);
        this.panelNode.removeEventListener("click", this.onClick, false);
        Firebug.SourceBoxPanel.destroyNode.apply(this, arguments);
        dispatch([Firebug.A11yModel], 'onDestroyNode', [this, 'css']);
    },

    show: function(state)
    {
        this.showToolbarButtons("fbCSSButtons", true);

        if (this.context.loaded && !this.location)
        {
            restoreObjects(this, state);

            if (state && state.scrollTop)
                this.panelNode.scrollTop = state.scrollTop;
        }
    },

    hide: function()
    {
        this.showToolbarButtons("fbCSSButtons", false);

        this.lastScrollTop = this.panelNode.scrollTop;
    },

    supportsObject: function(object)
    {
        if (object instanceof CSSStyleSheet)
            return 1;
        else if (object instanceof CSSStyleRule)
            return 2;
        else if (object instanceof SourceLink && object.type == "css" && reCSS.test(object.href))
            return 2;
        else
            return 0;
    },

    updateLocation: function(styleSheet)
    {
        if (!styleSheet)
            return;
        if (styleSheet.editStyleSheet)
            styleSheet = styleSheet.editStyleSheet.sheet;

        var rules = this.getStyleSheetRules(this.context, styleSheet);
        
        var result; 
        if (rules.length) {
            result = this.template.tag.replace({rules: rules}, this.panelNode);
        }
            else
            result = FirebugReps.Warning.tag.replace({object: "EmptyStyleSheet"}, this.panelNode);
        dispatch([Firebug.A11yModel], 'onCSSRulesAdded', [this, this.panelNode]);
    },

    updateSelection: function(object)
    {
        this.selection = null;

        if (object instanceof CSSStyleRule)
        {
            this.navigate(object.parentStyleSheet);
            this.highlightRule(object);
        }
        else if (object instanceof CSSStyleSheet)
        {
            this.navigate(object);
        }
        else if (object instanceof SourceLink)
        {
            try
            {
                clearNode(this.panelNode);  // replace rendered stylesheets
                this.showSourceFile(object);

                var lineNo = object.line;
                if (lineNo)
                    this.scrollToLine(lineNo, this.jumpHighlightFactory(lineNo, this.context));
            }
            catch(exc) {
                if (FBTrace.DBG_CSS)
                    FBTrace.dumpProperties("css.upDateSelection FAILS", exc);
            }
        }
    },

    getLocationList: function()
    {
        var styleSheets = getAllStyleSheets(this.context);
        return styleSheets;
    },

    getOptionsMenuItems: function()
    {
        return [
            {label: "Refresh", command: bind(this.refresh, this) }
        ];
    },

    getContextMenuItems: function(style, target)
    {
        var items = [];

        if (this.infoTipType == "color")
        {
            items.push(
                {label: "CopyColor",
                    command: bindFixed(copyToClipboard, FBL, this.infoTipObject) }
            );
        }
        else if (this.infoTipType == "image")
        {
            items.push(
                {label: "CopyImageLocation",
                    command: bindFixed(copyToClipboard, FBL, this.infoTipObject) },
                {label: "OpenImageInNewTab",
                    command: bindFixed(openNewTab, FBL, this.infoTipObject) }
            );
        }

        if (this.selection instanceof Element)
        {
            items.push(
                "-",
                {label: "EditStyle",
                    command: bindFixed(this.editElementStyle, this) }
            );
        }

        if (getAncestorByClass(target, "cssRule"))
        {
            items.push(
                "-",
                {label: "NewProp",
                    command: bindFixed(this.insertPropertyRow, this, target) }
            );

            var propRow = getAncestorByClass(target, "cssProp");
            if (propRow)
            {
                var propName = getChildByClass(propRow, "cssPropName").textContent;
                var isDisabled = hasClass(propRow, "disabledStyle");

                items.push(
                    {label: $STRF("EditProp", [propName]), nol10n: true,
                        command: bindFixed(this.editPropertyRow, this, propRow) },
                    {label: $STRF("DeleteProp", [propName]), nol10n: true,
                        command: bindFixed(this.deletePropertyRow, this, propRow) },
                    {label: $STRF("DisableProp", [propName]), nol10n: true,
                        type: "checkbox", checked: isDisabled,
                        command: bindFixed(this.disablePropertyRow, this, propRow) }
                );
            }
        }

        items.push(
            "-",
            {label: "Refresh", command: bind(this.refresh, this) }
        );

        return items;
    },

    browseObject: function(object)
    {
        if (this.infoTipType == "image")
        {
            openNewTab(this.infoTipObject);
            return true;
        }
    },

    showInfoTip: function(infoTip, target, x, y)
    {
        var propValue = getAncestorByClass(target, "cssPropValue");
        if (propValue)
        {
            var offset = getClientOffset(propValue);
            var offsetX = x-offset.x;

            var text = propValue.textContent;
            var charWidth = propValue.offsetWidth/text.length;
            var charOffset = Math.floor(offsetX/charWidth);

            var cssValue = parseCSSValue(text, charOffset);
            if (cssValue)
            {
                if (cssValue.value == this.infoTipValue)
                    return true;

                this.infoTipValue = cssValue.value;

                if (cssValue.type == "rgb" || (!cssValue.type && isColorKeyword(cssValue.value)))
                {
                    this.infoTipType = "color";
                    this.infoTipObject = cssValue.value;

                    return Firebug.InfoTip.populateColorInfoTip(infoTip, cssValue.value);
                }
                else if (cssValue.type == "url")
                {
                    var style = Firebug.getRepObject(target);
                    var baseURL = this.getStylesheetURL(style);
                    var relURL = parseURLValue(cssValue.value);
                    var absURL = isDataURL(relURL) ? relURL:absoluteURL(relURL, baseURL);
                    var repeat = parseRepeatValue(text);

                    this.infoTipType = "image";
                    this.infoTipObject = absURL;

                    return Firebug.InfoTip.populateImageInfoTip(infoTip, absURL, repeat);
                }
            }
        }

        delete this.infoTipType;
        delete this.infoTipValue;
        delete this.infoTipObject;
    },

    getEditor: function(target, value)
    {
        if (!this.editor)
            this.editor = new CSSEditor(this.document);

        return this.editor;
    },

    getDefaultLocation: function()
    {
        if (!this.context.loaded)
            return null;

        var styleSheets = this.context.window.document.styleSheets;
        if (styleSheets.length)
        {
            var sheet = styleSheets[0];
            return (Firebug.filterSystemURLs && isSystemURL(getURLForStyleSheet(sheet))) ? null : sheet;
        }
    },

    getObjectLocation: function(styleSheet)
    {
        return getURLForStyleSheet(styleSheet);
    },

    search: function(text, reverse)
    {
        var curDoc = this.searchCurrentDoc(!Firebug.searchGlobal, text, reverse);
        if (!curDoc && Firebug.searchGlobal)
        {
            return this.searchOtherDocs(text, reverse);
        }
        return curDoc;
    },

    searchOtherDocs: function(text, reverse)
    {
        var scanRE = new RegExp(text, Firebug.searchCaseSensitive ? "g" : "gi");

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
            return this.searchCurrentDoc(true, text, reverse);
        }
    },

    searchCurrentDoc: function(wrapSearch, text, reverse)
    {
        if (!text)
        {
            delete this.currentSearch;
            return false;
        }

        var row;
        if (this.currentSearch && text == this.currentSearch.text)
        {
            row = this.currentSearch.findNext(wrapSearch, false, reverse, Firebug.searchCaseSensitive);
        }
        else
        {
            if (this.editing)
            {
                this.currentSearch = new TextSearch(this.stylesheetEditor.box);
                row = this.currentSearch.find(text, reverse, Firebug.searchCaseSensitive);

                if (row)
                {
                    var sel = this.document.defaultView.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(this.currentSearch.range);
                    scrollSelectionIntoView(this);
                    return true;
                }
                else
                    return false;
            }
            else
            {
                function findRow(node) { return node.nodeType == 1 ? node : node.parentNode; }
                this.currentSearch = new TextSearch(this.panelNode, findRow);
                row = this.currentSearch.find(text, reverse, Firebug.searchCaseSensitive);
            }
        }

        if (row)
        {
            this.document.defaultView.getSelection().selectAllChildren(row);
            scrollIntoCenterView(row, this.panelNode);
            return true;
        }
        else
            return false;
    },

    getSearchOptionsMenuItems: function()
    {
        return [
            optionMenu("search.Match A or a", "searchCaseSensitive"),
            optionMenu("search.Multiple Files", "searchGlobal")
        ];
    }
});

// ************************************************************************************************

function CSSElementPanel() {}

CSSElementPanel.prototype = extend(Firebug.CSSStyleSheetPanel.prototype,
{
    template: domplate(
    {
        cascadedTag:
            DIV({},
                DIV({role : 'list'},
                    FOR("rule", "$rules",
                        TAG("$ruleTag", {rule: "$rule"})
                    )
                ),
                DIV({role : "list"},
                    FOR("section", "$inherited",
                        
                        H1({class: "cssInheritHeader groupHeader focusRow", role : 'listitem' },
                            SPAN({class: "cssInheritLabel"}, "$inheritLabel"),
                            TAG(FirebugReps.Element.shortTag, {object: "$section.element"})
                        ),
                        DIV({role : 'group'},
                            FOR("rule", "$section.rules",
                                TAG("$ruleTag", {rule: "$rule"})
                            )
                        )
                    )
                 )
            ),

        ruleTag:
            DIV({class: "cssRule insertInto", $cssInheritedRule: "$rule.inherited",
                 _repObject: "$rule.rule.style", "ruleId": "$rule.id",  role : 'presentation'},
                DIV({class: "cssHead focusRow",  role : 'listitem'},
                    SPAN({class: "cssSelector"}, "$rule.selector"), " {"
                ),
                DIV({role : 'group'},
                    DIV({class : "cssPropertyListBox", role : 'listbox'},
                        FOR("prop", "$rule.props",
                            DIV({class: "cssProp editGroup focusRow", $disabledStyle: "$prop.disabled",
                                    $cssOverridden: "$prop.overridden", role : "option"},
                                SPAN({class: "cssPropName editable"}, "$prop.name"),
                                SPAN({class: "cssColon"}, ":"),
                                SPAN({class: "cssPropValue editable"}, "$prop.value$prop.important"),
                                SPAN({class: "cssSemi"}, ";")
                            )
                        )
                    )
                ),
                DIV({class: "editable insertBefore", role:'presentation'}, "}"),
                TAG(FirebugReps.SourceLink.tag, {object: "$rule.sourceLink"})
            ),

        computedTag:
            DIV({},
                FOR("group", "$groups",
                    H1({class: "cssInheritHeader groupHeader focusRow"},
                        SPAN({class: "cssInheritLabel"}, "$group.title")
                    ),
                    TABLE({width: "100%", role : 'list'},
                        FOR("prop", "$group.props",
                            TR({class : 'focusRow', role : 'listitem'},
                                TD({class: "stylePropName", role : 'presentation'}, "$prop.name"),
                                TD({class: "stylePropValue", role : 'presentation'}, "$prop.value")
                            )
                        )
                    )
                )
            )
    }),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    updateCascadeView: function(element)
    {
        var rules = [], sections = [], usedProps = {};
        this.getInheritedRules(element, sections, usedProps);
        this.getElementRules(element, rules, usedProps);

        if (rules.length || sections.length)
        {
            var inheritLabel = $STR("InheritedFrom");
            var result = this.template.cascadedTag.replace({rules: rules, inherited: sections,
                inheritLabel: inheritLabel}, this.panelNode);
            dispatch([Firebug.A11yModel], 'onCSSRulesAdded', [this, result]);
        }
        else 
        {
            var result = FirebugReps.Warning.tag.replace({object: "EmptyElementCSS"}, this.panelNode);
            dispatch([Firebug.A11yModel], 'onCSSRulesAdded', [this, result]);
        }
    },

    updateComputedView: function(element)
    {
        var win = element.ownerDocument.defaultView;
        var style = win.getComputedStyle(element, "");

        var groups = [];

        for (var groupName in styleGroups)
        {
            var title = $STR("StyleGroup-" + groupName);
            var group = {title: title, props: []};
            groups.push(group);

            var props = styleGroups[groupName];
            for (var i = 0; i < props.length; ++i)
            {
                var propName = props[i];
                var propValue = stripUnits(rgbToHex(style.getPropertyValue(propName)));
                if (propValue)
                    group.props.push({name: propName, value: propValue});
            }
        }

        var result = this.template.computedTag.replace({groups: groups}, this.panelNode);
        dispatch([Firebug.A11yModel], 'onCSSRulesAdded', [this, result]);
    },

    getStylesheetURL: function(style)
    {
        // if the parentStyleSheet.href is null, CSS std says its inline style
        if (style && style.parentRule && style.parentRule.parentStyleSheet.href)
            return style.parentRule.parentStyleSheet.href;
        else
            return this.selection.ownerDocument.location.href;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    getInheritedRules: function(element, sections, usedProps)
    {
        var parent = element.parentNode;
        if (parent && parent.nodeType == 1)
        {
            this.getInheritedRules(parent, sections, usedProps);

            var rules = [];
            this.getElementRules(parent, rules, usedProps, true);

            if (rules.length)
                sections.splice(0, 0, {element: parent, rules: rules});
        }
    },

    getElementRules: function(element, rules, usedProps, inheritMode)
    {
        var inspectedRules;
        try
        {
            inspectedRules = domUtils ? domUtils.getCSSStyleRules(element) : null;
        } catch (exc) {}

        if (inspectedRules)
        {
            for (var i = 0; i < inspectedRules.Count(); ++i)
            {
                var rule = QI(inspectedRules.GetElementAt(i), nsIDOMCSSStyleRule);

                var href = rule.parentStyleSheet.href;  // Null means inline

                if (href && !Firebug.showUserAgentCSS && isSystemURL(href)) // This removes user agent rules
                    continue;
                if (!href)
                    href = element.ownerDocument.location.href; // http://code.google.com/p/fbug/issues/detail?id=452

                var props = this.getRuleProperties(this.context, rule, inheritMode);
                if (inheritMode && !props.length)
                    continue;

                this.markOverridenProps(props, usedProps, inheritMode);

                var line = domUtils.getRuleLine(rule);
                var ruleId = rule.selectorText+"/"+line;
                var sourceLink = new SourceLink(href, line, "css", rule);
                rules.splice(0, 0, {rule: rule, id: ruleId,
                        selector: rule.selectorText, sourceLink: sourceLink,
                        props: props, inherited: inheritMode});
            }
        }

        this.getStyleProperties(element, rules, usedProps, inheritMode);

        if (FBTrace.DBG_CSS)
            FBTrace.sysout("getElementRules "+rules.length+" rules for "+getElementXPath(element), rules);
    },

    markOverridenProps: function(props, usedProps, inheritMode)
    {
        for (var i = 0; i < props.length; ++i)
        {
            var prop = props[i];
            if ( usedProps.hasOwnProperty(prop.name) )
            {
                var deadProps = usedProps[prop.name]; // all previous occurances of this property
                for (var j = 0; j < deadProps.length; ++j)
                {
                    var deadProp = deadProps[j];
                    if (!deadProp.disabled && !deadProp.wasInherited && deadProp.important && !prop.important)
                        prop.overridden = true;  // new occurance overridden
                    else if (!prop.disabled)
                        deadProp.overridden = true;  // previous occurances overridden
                }
            }
            else
                usedProps[prop.name] = [];

            prop.wasInherited = inheritMode ? true : false;
            usedProps[prop.name].push(prop);  // all occurances of a property seen so far, by name
        }
    },

    getStyleProperties: function(element, rules, usedProps, inheritMode)
    {
        var props = [];

        var style = element.style;
        for (var i = 0; i < style.length; ++i)
        {
            var name = style.item(i);
            var value = style.getPropertyValue(name);
            var important = style.getPropertyPriority(name) == "important";
            if (value)
                this.addProperty(name, value, important, false, inheritMode, props);
        }

        this.addOldProperties(this.context, getElementXPath(element), inheritMode, props);

        sortProperties(props);
        this.markOverridenProps(props, usedProps, inheritMode);

        if (props.length)
            rules.splice(0, 0,
                    {rule: element, id: getElementXPath(element),
                        selector: "element.style", props: props, inherited: inheritMode});
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Panel

    name: "css",
    parentPanel: "html",
    order: 0,

    show: function(state)
    {
        // Do nothing, and don't call superclass
    },

    supportsObject: function(object)
    {
        return object instanceof Element ? 1 : 0;
    },

    updateSelection: function(element)
    {
        if ( !(element instanceof Element) ) // html supports SourceLink
            return;

        if (sothinkInstalled)
        {
            FirebugReps.Warning.tag.replace({object: "SothinkWarning"}, this.panelNode);
            return;
        }

        if (!domUtils)
        {
            FirebugReps.Warning.tag.replace({object: "DOMInspectorWarning"}, this.panelNode);
            return;
        }

        if (!element)
            return;

        if (Firebug.showComputedStyle)
            this.updateComputedView(element);
        else
            this.updateCascadeView(element);
    },

    updateOption: function(name, value)
    {
        if (name == "showComputedStyle" || name == "showUserAgentCSS")
            this.refresh();
    },

    getOptionsMenuItems: function()
    {
        return [
            {label: "ShowComputedStyle", type: "checkbox", checked: Firebug.showComputedStyle,
                command: bindFixed(Firebug.togglePref, Firebug, "showComputedStyle") },
            {label: "Show User Agent CSS", type: "checkbox", checked: Firebug.showUserAgentCSS,
                    command: bindFixed(Firebug.togglePref, Firebug, "showUserAgentCSS") }
        ];
    }
});

// ************************************************************************************************
// CSSEditor

function CSSEditor(doc)
{
    this.initializeInline(doc);
}

CSSEditor.prototype = domplate(Firebug.InlineEditor.prototype,
{
    insertNewRow: function(target, insertWhere)
    {
        var emptyProp = {name: "", value: ""};
        var sibling = insertWhere == "before" ? target.previousSibling : target;

        return CSSPropTag.insertAfter({prop: emptyProp}, sibling);
    },

    saveEdit: function(target, value, previousValue)
    {
        target.innerHTML = escapeHTML(value);

        var row = getAncestorByClass(target, "cssProp");
        if (hasClass(row, "disabledStyle"))
            toggleClass(row, "disabledStyle");

        var style = Firebug.getRepObject(target);

        if (hasClass(target, "cssPropName"))
        {
            if (value && previousValue != value)  // name of property has changed.
            {
                var propValue = getChildByClass(row, "cssPropValue").textContent;
                var parsedValue = parsePriority(propValue);
                
                if (propValue && propValue != "undefined") {
                    if (FBTrace.DBG_CSS)
                        FBTrace.sysout("CSSEditor.saveEdit : "+previousValue+"->"+value+" = "+propValue+"\n");
                    if (previousValue)
                        Firebug.CSSModule.removeProperty(style, previousValue);
                    Firebug.CSSModule.setProperty(style, value, parsedValue.value, parsedValue.priority);
                }
            }
            else if (!value) // name of the property has been deleted, so remove the property.
                Firebug.CSSModule.removeProperty(style, previousValue);
        }
        else if (getAncestorByClass(target, "cssPropValue"))
        {
            var propName = getChildByClass(row, "cssPropName").textContent;
            var propValue = getChildByClass(row, "cssPropValue").textContent;

            if (FBTrace.DBG_CSS) /*@explore*/
            {
                FBTrace.sysout("CSSEditor.saveEdit propName=propValue: "+propName +" = "+propValue+"\n"); /*@explore*/
               // FBTrace.dumpProperties("CSSEditor.saveEdit BEFORE style:",style);
            }

            if (value && value != "null")
            {
                var parsedValue = parsePriority(value);
                Firebug.CSSModule.setProperty(style, propName, parsedValue.value, parsedValue.priority);
            }
            else if (previousValue && previousValue != "null")
                Firebug.CSSModule.removeProperty(style, propName);
        }

        this.panel.markChange(this.panel.name == "stylesheet");
    },

    advanceToNext: function(target, charCode)
    {
        if (charCode == 58 /*":"*/ && hasClass(target, "cssPropName"))
            return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    getAutoCompleteRange: function(value, offset)
    {
        if (hasClass(this.target, "cssPropName"))
            return {start: 0, end: value.length-1};
        else
            return parseCSSValue(value, offset);
    },

    getAutoCompleteList: function(preExpr, expr, postExpr)
    {
        if (hasClass(this.target, "cssPropName"))
        {
            return getCSSPropertyNames();
        }
        else
        {
            var row = getAncestorByClass(this.target, "cssProp");
            var propName = getChildByClass(row, "cssPropName").textContent;
            return getCSSKeywordsByProperty(propName);
        }
    }
});

// ************************************************************************************************
// StyleSheetEditor

function StyleSheetEditor(doc)
{
    this.box = this.tag.replace({}, doc, this);
    this.input = this.box.firstChild;
}

StyleSheetEditor.prototype = domplate(Firebug.BaseEditor,
{
    multiLine: true,

    tag: DIV(
        TEXTAREA({class: "styleSheetEditor fullPanelEditor", oninput: "$onInput"})
    ),

    getValue: function()
    {
        return this.input.value;
    },

    setValue: function(value)
    {
        return this.input.value = value;
    },

    show: function(target, panel, value, textSize, targetSize)
    {
        this.target = target;
        this.panel = panel;

        this.panel.panelNode.appendChild(this.box);

        this.input.value = value;
        this.input.focus();

        var command = this.panel.context.chrome.$("cmd_toggleCSSEditing");
        command.setAttribute("checked", true);
    },

    hide: function()
    {
        var chrome = this.panel.context.chrome;

        var command = chrome.$("cmd_toggleCSSEditing");
        command.setAttribute("checked", false);

        if (this.box.parentNode == this.panel.panelNode)
            this.panel.panelNode.removeChild(this.box);

        delete this.target;
        delete this.panel;
        delete this.styleSheet;
    },

    saveEdit: function(target, value, previousValue)
    {
        var ownerNode = getStyleSheetOwnerNode(this.styleSheet);

        if (!this.styleSheet.editStyleSheet)
        {
            this.styleSheet.disabled = true;

            var url = CCSV("@mozilla.org/network/standard-url;1", Components.interfaces.nsIURL);
            url.spec = this.styleSheet.href;

            var editStyleSheet = this.editStyleSheet;
            editStyleSheet = ownerNode.ownerDocument.createElementNS("http://www.w3.org/1999/xhtml",
                "style");
            editStyleSheet.firebugIgnore = true;
            editStyleSheet.setAttribute("type", "text/css");
            editStyleSheet.setAttributeNS("http://www.w3.org/XML/1998/namespace", "base",
                url.directory);

            // Insert the edited stylesheet directly after the old one to ensure the styles
        // cascade properly.
        ownerNode.parentNode.insertBefore(editStyleSheet, ownerNode.nextSibling);

            this.styleSheet.editStyleSheet = editStyleSheet;
        }

        this.styleSheet.editStyleSheet.innerHTML = value;
        if (FBTrace.DBG_CSS)  /*@explore*/
            FBTrace.sysout("css.saveEdit styleSheet.href:"+this.styleSheet.href+" got innerHTML:"+value+"\n"); /*@explore*/
    },

    endEditing: function()
    {
        this.panel.refresh();
        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

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

// ************************************************************************************************
// Local Helpers

function rgbToHex(value)
{
    return value.replace(/\brgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)/gi, function(_, r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + (b << 0)).toString(16).substr(-6).toUpperCase();
    });
}

function stripUnits(value)
{
    // remove units from '0px', '0em' etc. leave non-zero units in-tact.
    return value.replace(/(url\(.*?\)|[^0]\S*\s*)|0(%|em|ex|px|in|cm|mm|pt|pc)(\s|$)/gi, function(_, skip, remove, whitespace) {
    return skip || ('0' + whitespace);
    });
}

function parsePriority(value)
{
    var rePriority = /(.*?)\s*(!important)?$/;
    var m = rePriority.exec(value);
    var propValue = m ? m[1] : "";
    var priority = m && m[2] ? "important" : "";
    return {value: propValue, priority: priority};
}

function parseURLValue(value)
{
    var m = reURL.exec(value);
    return m ? m[1] : "";
}

function parseRepeatValue(value)
{
    var m = reRepeat.exec(value);
    return m ? m[0] : "";
}

function parseCSSValue(value, offset)
{
    var start = 0;
    var m;
    while (1)
    {
        m = reSplitCSS.exec(value);
        if (m && m.index+m[0].length < offset)
        {
            value = value.substr(m.index+m[0].length);
            start += m.index+m[0].length;
            offset -= m.index+m[0].length;
        }
        else
            break;
    }

    if (m)
    {
        var type;
        if (m[1])
            type = "url";
        else if (m[2] || m[3])
            type = "rgb";
        else if (m[4])
            type = "int";

        return {value: m[0], start: start+m.index, end: start+m.index+(m[0].length-1), type: type};
    }
}

function findPropByName(props, name)
{
    for (var i = 0; i < props.length; ++i)
    {
        if (props[i].name == name)
            return i;
    }
}

function sortProperties(props)
{
    props.sort(function(a, b)
    {
        return a.name > b.name ? 1 : -1;
    });
}

function getTopmostRuleLine(panelNode)
{
    for (var child = panelNode.firstChild; child; child = child.nextSibling)
    {
        if (child.offsetTop+child.offsetHeight > panelNode.scrollTop)
        {
            var rule = child.repObject ? child.repObject.parentRule : null;
            if (rule)
                return {
                    line: domUtils.getRuleLine(rule),
                    offset: panelNode.scrollTop-child.offsetTop
                };
        }
    }
    return 0;
}

function getStyleSheetCSS(sheet, context)
{
    if (sheet.ownerNode instanceof HTMLStyleElement)
        return sheet.ownerNode.innerHTML;
    else
        return context.sourceCache.load(sheet.href).join("");
}

function getStyleSheetOwnerNode(sheet) {
    for (; sheet && !sheet.ownerNode; sheet = sheet.parentStyleSheet);

    return sheet.ownerNode;
}

function scrollSelectionIntoView(panel)
{
    var selCon = getSelectionController(panel);
    selCon.scrollSelectionIntoView(
            nsISelectionController.SELECTION_NORMAL,
            nsISelectionController.SELECTION_FOCUS_REGION, true);
}

function getSelectionController(panel)
{
    var browser = panel.context.chrome.getPanelBrowser(panel);
    return browser.docShell.QueryInterface(nsIInterfaceRequestor)
        .getInterface(nsISelectionDisplay)
        .QueryInterface(nsISelectionController);
}

// ************************************************************************************************

Firebug.registerModule(Firebug.CSSModule);
Firebug.registerPanel(Firebug.CSSStyleSheetPanel);
Firebug.registerPanel(CSSElementPanel);

// ************************************************************************************************

}});
