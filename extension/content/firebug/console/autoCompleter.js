/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/wrapper",
    "firebug/lib/dom",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/console/closureInspector",
    "firebug/console/commandLineExposed",
],
function(Obj, Firebug, Domplate, Locale, Events, Wrapper, Dom, Str, Arr, ClosureInspector,
    CommandLineExposed) {

"use strict";

// ********************************************************************************************* //
// Constants

var kwActions = ["throw", "return", "in", "instanceof", "delete", "new",
                   "typeof", "void", "yield"];
var kwAll = ["break", "case", "catch", "const", "continue", "debugger",
  "default", "delete", "do", "else", "false", "finally", "for", "function",
  "get", "if", "in", "instanceof", "let", "new", "null", "return", "set",
  "switch", "this", "throw", "true", "try", "typeof", "var", "void", "while",
  "with", "yield"];
var reOpenBracket = /[\[\(\{]/;
var reCloseBracket = /[\]\)\}]/;
var reJSChar = /[a-zA-Z0-9$_]/;
var reLiteralExpr = /^[ "0-9,]*$/;

var measureCache = {};

// ********************************************************************************************* //
// JavaScript auto-completion

function JSAutoCompleter(textBox, completionBox, options)
{
    var popupSize = 40;

    this.textBox = textBox;
    this.options = options;

    this.completionBox = completionBox;
    this.popupTop = this.popupBottom = null;

    this.completionBase = {
        pre: null,
        expr: null,
        forceShowPopup: false,
        candidates: [],
        hiddenCandidates: []
    };
    this.completions = null;

    this.revertValue = null;

    this.showCompletionPopup = options.showCompletionPopup;
    this.completionPopup = options.completionPopup;
    this.selectedPopupElement = null;

    /**
     * If a completion was just performed, revert it. Otherwise do nothing.
     * Returns true iff the completion was reverted.
     */
    this.revert = function(context)
    {
        if (this.revertValue === null)
            return false;

        this.textBox.value = this.revertValue;
        var len = this.textBox.value.length;
        setCursorToEOL(this.textBox);

        this.complete(context);
        return true;
    };

    /**
     * Hide completions temporarily, so they show up again on the next key press.
     */
    this.hide = function()
    {
        this.completionBase = {
            pre: null,
            expr: null,
            forceShowPopup: false,
            candidates: [],
            hiddenCandidates: []
        };
        this.completions = null;

        this.showCompletions(false);
    };

    /**
     * Completely reset the auto-completer.
     */
    this.reset = function()
    {
        this.hide();
        this.revertValue = null;
    };

    /**
     * Hide completions for this expression (/completion base). Appending further
     * characters to the variable name will not make completions appear, but
     * adding, say, a semicolon and typing something else will.
     */
    this.hideForExpression = function()
    {
        this.completionBase.candidates = [];
        this.completionBase.hiddenCandidates = [];
        this.completions = null;

        this.showCompletions(false);
    };

    /**
     * Check whether it would be acceptable for the return key to evaluate the
     * expression instead of completing things.
     */
    this.acceptReturn = function()
    {
        if (!this.completions)
            return true;

        if (this.getCompletionValue() === this.textBox.value)
        {
            // The user wouldn't see a difference if we completed. This can
            // happen for example if you type 'alert' and press enter,
            // regardless of whether or not there exist other completions.
            return true;
        }

        return false;
    };

    /**
     * Show completions for the current contents of the text box. Either this or
     * hide() must be called when the contents change.
     */
    this.complete = function(context, force)
    {
        this.revertValue = null;
        var offset = this.textBox.selectionStart;
        if (this.createCandidates(context, this.textBox.value, offset, force))
            this.showCompletions(false);
        else
            this.hide();
    };

    /**
     * Update the completion base and create completion candidates for the
     * current value of the text box.
     */
    this.createCandidates = function(context, value, offset, force)
    {
        if (offset !== value.length)
            return false;

        // Create a simplified expression by redacting contents/normalizing
        // delimiters of strings and regexes, to make parsing easier.
        // Give up if the syntax is too weird.
        var svalue = simplifyExpr(value, this.options.multiLine);
        if (svalue === null)
            return false;

        if (killCompletions(svalue, value, force))
            return false;

        // Find the expression to be completed.
        var parseStart = getExpressionOffset(svalue);
        var parsed = value.substr(parseStart);
        var sparsed = svalue.substr(parseStart);

        // Find which part of it represents the property access.
        var propertyStart = getPropertyOffset(sparsed);
        var prop = parsed.substring(propertyStart);
        var spreExpr = sparsed.substr(0, propertyStart);
        var preExpr = parsed.substr(0, propertyStart);

        var spreParsed = svalue.substr(0, parseStart);
        var preParsed = value.substr(0, parseStart);

        if (FBTrace.DBG_COMMANDLINE)
        {
            var sep = (parsed.indexOf("|") > -1) ? "^" : "|";
            FBTrace.sysout("Completing: " + preParsed + sep + preExpr + sep + prop);
        }

        var prevCompletions = this.completions;

        // We only need to calculate a new candidate list if the expression has changed.
        if (preExpr !== this.completionBase.expr || preParsed !== this.completionBase.pre)
        {
            var evalOptions = {
                includeCommandLineAPI: options.includeCommandLineAPI,
                includeCurrentScope: options.includeCurrentScope
            };
            if (!preExpr)
            {
                // Add names of variables declared previously in the typed code.
                evalOptions.additionalCompletions =
                    this.options.additionalGlobalCompletions ||
                    getNewlyDeclaredNames(spreParsed);
            }

            this.completionBase.expr = preExpr;
            this.completionBase.pre = preParsed;
            var ev = autoCompleteEval(context, preExpr, spreExpr,
                preParsed, spreParsed, evalOptions);
            prevCompletions = null;
            this.completionBase.candidates = ev.completions;
            this.completionBase.hiddenCandidates = ev.hiddenCompletions;
            this.completionBase.forceShowPopup = false;
        }

        this.createCompletions(prop, prevCompletions, force);
        return true;
    };

    /**
     * From a valid completion base, create a list of completions (containing
     * those completion candidates that share a (sometimes case-insensitive)
     * prefix with the user's input) and a default completion. The completions
     * for the previous expression (null if none) are used to help with the
     * latter.
     */
    this.createCompletions = function(prefix, prevCompletions, force)
    {
        if (!this.completionBase.expr && !prefix && !force)
        {
            // Don't complete "".
            this.completions = null;
            return;
        }
        if (!this.completionBase.candidates.length && !prefix && !force)
        {
            // Don't complete empty objects -> toString.
            this.completions = null;
            return;
        }

        var valid = [], ciValid = [];
        var clist = [this.completionBase.candidates, this.completionBase.hiddenCandidates];
        var cind = 0;

        var lowPrefix = prefix.toLowerCase();
        var mustMatchFirstLetter = (!this.completionBase.expr && prefix.length > 0);
        while (ciValid.length === 0 && cind < 2)
        {
            var candidates = clist[cind];
            for (var i = 0; i < candidates.length; ++i)
            {
                // Mark a candidate as matching if it matches the prefix case-
                // insensitively, and shares its upper-case characters. The
                // exception to this is that for global completions, the first
                // character must match exactly (see issue 6030).
                var cand = candidates[i], name = cand.name;
                if (!Str.hasPrefix(name.toLowerCase(), lowPrefix))
                    continue;

                if (mustMatchFirstLetter && name.charAt(0) !== prefix.charAt(0))
                    continue;

                var fail = false;
                for (var j = 0; j < prefix.length; ++j)
                {
                    var ch = prefix.charAt(j);
                    if (ch !== ch.toLowerCase() && ch !== name.charAt(j))
                    {
                        fail = true;
                        break;
                    }
                }
                if (!fail)
                {
                    ciValid.push(cand);
                    if (Str.hasPrefix(name, prefix))
                        valid.push(cand);
                }
            }
            ++cind;
        }

        if (ciValid.length > 0)
        {
            // If possible, default to a candidate matching the case by picking
            // a default from 'valid' and correcting its index.
            var hasMatchingCase = (valid.length > 0);

            this.completions = {
                list: (hasMatchingCase ? valid : ciValid),
                prefix: prefix,
                hidePopup: (cind === 2),
                forced: force
            };
            this.completions.index = this.pickDefaultCandidate(prevCompletions);

            if (hasMatchingCase)
            {
                var find = valid[this.completions.index];
                this.completions.list = ciValid;
                this.completions.index = ciValid.indexOf(find);
            }
        }
        else
        {
            this.completions = null;
        }
    };

    /**
     * Choose a default candidate from the list of completions. The first of all
     * shortest completions is currently used for this, except in some very hacky,
     * but useful, special cases.
     */
    this.pickDefaultCandidate = function(prevCompletions)
    {
        var list = this.completions.list.map(function(x)
        {
            return x.name;
        }), ind;

        // If the typed expression is an extension of the previous completion, keep it.
        if (prevCompletions && Str.hasPrefix(this.completions.prefix, prevCompletions.prefix))
        {
            var lastCompletion = prevCompletions.list[prevCompletions.index].name;
            ind = list.indexOf(lastCompletion);
            if (ind !== -1)
                return ind;
        }

        if (!this.completionBase.expr && !this.completions.prefix)
            return list.length - 1;

        // Special-case certain expressions. (But remember to pick prefix-free
        // candidates; otherwise "validVariable<return>" can auto-complete
        // instead of run.)
        var prefixFree = function(name)
        {
            return !list.some(function(x)
            {
                return x.length < name.length && Str.hasPrefix(name, x);
            });
        };
        var special = {
            "": ["document", "console", "frames", "window", "parseInt", "undefined", "navigator",
                "Array", "Math", "Object", "String", "XMLHttpRequest", "Window"],
            "window.": ["console"],
            "location.": ["href"],
            "console.": ["log"],
            "document.": ["getElementById", "addEventListener", "createElement", "documentElement"],
            "Object.prototype.toString.": ["call"]
        };
        if (special.hasOwnProperty(this.completionBase.expr))
        {
            var ar = special[this.completionBase.expr];
            for (var i = 0; i < ar.length; ++i)
            {
                var prop = ar[i];
                if (Str.hasPrefix(prop, this.completions.prefix))
                {
                    // Use 'prop' as a completion, if it exists.
                    ind = list.indexOf(prop);
                    if (ind !== -1 && prefixFree(prop))
                        return ind;
                }
            }
        }

        // 'prototype' is a good default if it exists.
        ind = list.indexOf("prototype");
        if (ind !== -1 && prefixFree("prototype"))
            return ind;

        // Simply pick out the shortest candidate. This works remarkably well.
        ind = 0;
        for (var i = 1; i < list.length; ++i)
        {
            if (list[i].length < list[ind].length)
                ind = i;
        }

        // Avoid some completions in favor of others.
        var replacements = {
            "toSource": "toString",
            "toFixed": "toString",
            "watch": "toString",
            "pattern": "parentNode",
            "getSelection": "getEventListeners",
            "inspect": "include",
            "home": "history"
        };
        if (replacements.hasOwnProperty(list[ind]))
        {
            var ind2 = list.indexOf(replacements[list[ind]]);
            if (ind2 !== -1)
                return ind2;
        }

        return ind;
    };

    /**
     * Go backward or forward by some number of steps in the list of completions.
     * dir is the relative movement in the list (negative for backwards movement).
     */
    this.cycle = function(dir, clamp)
    {
        var ind = this.completions.index + dir;
        if (clamp)
            ind = Math.max(Math.min(ind, this.completions.list.length - 1), 0);
        else if (ind >= this.completions.list.length)
            ind = 0;
        else if (ind < 0)
            ind = this.completions.list.length - 1;
        this.completions.index = ind;
        this.showCompletions(true);
    };

    /**
     * Get the property name that is currently selected as a completion (or
     * null if there is none).
     */
    this.getCurrentCompletion = function()
    {
        return (this.completions ? this.completions.list[this.completions.index].name : null);
    };

    /**
     * See if we have any completions.
     */
    this.hasCompletions = function()
    {
        return !!this.completions;
    };

    /**
     * Get the value the completion box should have for some value of the
     * text box and a selected completion.
     */
    this.getCompletionBoxValue = function()
    {
        var completion = this.getCurrentCompletion();
        if (completion === null)
            return "";
        var userTyped = this.textBox.value;
        var value = this.completionBase.pre + this.completionBase.expr + completion;
        var whitespace = " ".repeat(userTyped.length);
        return whitespace + value.substr(userTyped.length);
    };

    /**
     * Update the completion box and popup to be consistent with the current
     * state of the auto-completer. If just cycling, the old scolling state
     * for the popup is preserved.
     */
    this.showCompletions = function(cycling)
    {
        this.completionBox.value = this.getCompletionBoxValue();

        if (this.completions && (this.completionBase.forceShowPopup ||
            (this.completions.list.length > 1 && this.showCompletionPopup &&
             !this.completions.hidePopup)))
        {
            this.popupCandidates(cycling);
        }
        else
        {
            this.closePopup();
        }
    };

    /**
     * Handle a keypress event. Returns true if the auto-completer used up
     * the event and does not want it to propagate further.
     */
    this.handleKeyPress = function(event, context)
    {
        var clearedTabWarning = this.clearTabWarning();

        if (Events.isAlt(event))
            return false;

        if (event.keyCode === KeyEvent.DOM_VK_TAB &&
            !Events.isControl(event) && !Events.isControlShift(event) &&
            this.textBox.value !== "")
        {
            if (this.completions)
            {
                this.acceptCompletion();
                Events.cancelEvent(event);
                return true;
            }
            else if (this.options.tabWarnings)
            {
                if (clearedTabWarning)
                {
                    // Send tab along if the user was warned.
                    return false;
                }

                this.setTabWarning();
                Events.cancelEvent(event);
                return true;
            }
        }
        else if (event.keyCode === KeyEvent.DOM_VK_RETURN && !this.acceptReturn())
        {
            // Completion on return, when one is user-visible.
            this.acceptCompletion();
            Events.cancelEvent(event);
            return true;
        }
        else if (event.keyCode === KeyEvent.DOM_VK_RIGHT && this.completions &&
            this.textBox.selectionStart === this.textBox.value.length)
        {
            // Complete on right arrow at end of line.
            this.acceptCompletion();
            Events.cancelEvent(event);
            return true;
        }
        else if (event.keyCode === KeyEvent.DOM_VK_BACK_SPACE)
        {
            if (this.completions && !this.textBox.value)
            {
                this.hide();
                Events.cancelEvent(event);
                return true;
            }
        }
        else if (event.keyCode === KeyEvent.DOM_VK_ESCAPE)
        {
            if (this.completions)
            {
                if (this.completions.forced)
                    this.hide();
                else
                    this.hideForExpression();
                Events.cancelEvent(event);
                return true;
            }
            else
            {
                // There are no visible completions, but we might still be able to
                // revert a recently performed completion.
                if (this.revert(context))
                {
                    Events.cancelEvent(event);
                    return true;
                }
            }
        }
        else if (event.keyCode === KeyEvent.DOM_VK_UP ||
            event.keyCode === KeyEvent.DOM_VK_DOWN)
        {
            if (this.completions)
            {
                this.cycle(event.keyCode === KeyEvent.DOM_VK_UP ? -1 : 1, false);
                Events.cancelEvent(event);
                return true;
            }
        }
        else if (event.keyCode === KeyEvent.DOM_VK_PAGE_UP ||
            event.keyCode === KeyEvent.DOM_VK_PAGE_DOWN)
        {
            if (this.completions)
            {
                this.pageCycle(event.keyCode === KeyEvent.DOM_VK_PAGE_UP ? -1 : 1);
                Events.cancelEvent(event);
                return true;
            }
        }
        else if (event.keyCode === KeyEvent.DOM_VK_HOME ||
            event.keyCode === KeyEvent.DOM_VK_END)
        {
            if (this.isPopupOpen())
            {
                this.topCycle(event.keyCode === KeyEvent.DOM_VK_HOME ? -1 : 1);
                Events.cancelEvent(event);
                return true;
            }
        }
        return false;
    };

    /**
     * Handle a keydown event.
     */
    this.handleKeyDown = function(event, context)
    {
        if (event.keyCode === KeyEvent.DOM_VK_ESCAPE && this.completions)
        {
            // Close the completion popup on escape in keydown, so that the popup
            // does not close itself and prevent event propagation on keypress.
            // (Unless the popup is only open due to Ctrl+Space on a non-empty
            // command line, in which case that's precisely what we want.)
            if (!this.forceShowPopup || this.completions.forced)
                this.closePopup();
        }
        else if (event.keyCode === KeyEvent.DOM_VK_SPACE && Events.isControl(event))
        {
            if (!this.completions)
            {
                // If completions have been hidden, show them again.
                this.hide();
                this.complete(context);
            }

            if (this.completions && !this.isPopupOpen())
            {
                // Force-show the completion popup.
                this.completionBase.forceShowPopup = true;
                this.popupCandidates(false);
            }
        }
    };

    this.clearTabWarning = function()
    {
        if (this.tabWarning)
        {
            this.completionBox.value = "";
            delete this.tabWarning;
            return true;
        }
        return false;
    };

    this.setTabWarning = function()
    {
        var whitespace = " ".repeat(this.textBox.value.length);
        this.completionBox.value = whitespace + "    " +
            Locale.$STR("firebug.completion.empty");

        this.tabWarning = true;
    };

    /**
     * Get what should be completed to; this is only vaguely related to what is
     * shown in the completion box.
     */
    this.getCompletionValue = function()
    {
        var property = this.getCurrentCompletion();
        var preParsed = this.completionBase.pre, preExpr = this.completionBase.expr;
        var res = preParsed + preExpr + property;

        // Don't adjust index completions.
        if (/^\[['"]$/.test(preExpr.slice(-2)))
            return res;

        if (!isValidProperty(property))
        {
            // The property name is actually invalid in free form, so replace
            // it with array syntax.

            if (preExpr)
            {
                res = preParsed + preExpr.slice(0, -1);
            }
            else
            {
                // Global variable access - assume the variable is a member of 'window'.
                res = preParsed + "window";
            }
            res += '["' + Str.escapeJS(property) + '"]';
        }
        return res;
    };

    /**
     * Accept the current completion into the text box.
     */
    this.acceptCompletion = function()
    {
        var completion = this.getCompletionValue();
        var originalValue = this.textBox.value;
        this.textBox.value = completion;
        setCursorToEOL(this.textBox);

        this.hide();
        this.revertValue = originalValue;
    };

    this.pageCycle = function(dir)
    {
        var length = this.completions.list.length, selIndex = this.completions.index;

        if (!this.isPopupOpen())
        {
            // When no popup is open, cycle by a fixed amount and stop at edges.
            this.cycle(dir * 15, true);
            return;
        }

        var top = this.popupTop, bottom = this.popupBottom;
        if (top === 0 && bottom === length)
        {
            // For a single scroll page, act like home/end.
            this.topCycle(dir);
            return;
        }

        var immediateTarget;
        if (dir === -1)
            immediateTarget = (top === 0 ? top : top + 2);
        else
            immediateTarget = (bottom === length ? bottom: bottom - 2) - 1;
        if ((selIndex - immediateTarget) * dir < 0)
        {
            // The selection has not yet reached the edge target, so jump to it.
            selIndex = immediateTarget;
        }
        else
        {
            // Show the next page.
            if (dir === -1 && top - popupSize <= 0)
                selIndex = 0;
            else if (dir === 1 && bottom + popupSize >= length)
                selIndex = length - 1;
            else
                selIndex = immediateTarget + dir*popupSize;
        }

        this.completions.index = selIndex;
        this.showCompletions(true);
    };

    this.topCycle = function(dir)
    {
        if (dir === -1)
            this.completions.index = 0;
        else
            this.completions.index = this.completions.list.length - 1;
        this.showCompletions(true);
    };

    this.popupCandidates = function(cycling)
    {
        Dom.eraseNode(this.completionPopup);
        this.selectedPopupElement = null;

        var vbox = this.completionPopup.ownerDocument.createElement("vbox");
        vbox.classList.add("fbCommandLineCompletions");
        this.completionPopup.appendChild(vbox);

        var title = this.completionPopup.ownerDocument.
            createElementNS("http://www.w3.org/1999/xhtml", "div");
        title.textContent = Locale.$STR("console.Use Arrow keys, Tab or Enter");
        title.classList.add("fbPopupTitle");
        vbox.appendChild(title);

        var list = this.completions.list, selIndex = this.completions.index;

        if (list.length <= popupSize)
        {
            this.popupTop = 0;
            this.popupBottom = list.length;
        }
        else
        {
            var self = this;
            var setTop = function(val)
            {
                if (val < 0)
                    val = 0;
                self.popupTop = val;
                self.popupBottom = val + popupSize;
                if (self.popupBottom > list.length)
                    setBottom(list.length);
            };
            var setBottom = function(val)
            {
                if (val > list.length)
                    val = list.length;
                self.popupBottom = val;
                self.popupTop = val - popupSize;
                if (self.popupTop < 0)
                    setTop(0);
            };

            if (!cycling)
            {
                // Show the selection at nearly the bottom of the popup, where
                // it is more local.
                setBottom(selIndex + 3);
            }
            else
            {
                // Scroll the popup such that selIndex fits.
                if (selIndex - 2 < this.popupTop)
                    setTop(selIndex - 2);
                else if (selIndex + 3 > this.popupBottom)
                    setBottom(selIndex + 3);
            }
        }

        var separatorInserted = false;

        for (var i = this.popupTop; i < this.popupBottom; i++)
        {
            var prefixLen = this.completions.prefix.length;
            var completion = list[i], name = completion.name;

            var hbox = this.completionPopup.ownerDocument.
                createElementNS("http://www.w3.org/1999/xhtml", "div");
            hbox.completionIndex = i;
            hbox.classList.add("completionLine");
            hbox.classList.add("fbPopupEntry");

            var pre = this.completionPopup.ownerDocument.
                createElementNS("http://www.w3.org/1999/xhtml", "span");
            var preText = this.completionBase.expr + name.substr(0, prefixLen);
            pre.textContent = preText;
            pre.classList.add("userTypedText");

            var post = this.completionPopup.ownerDocument.
                createElementNS("http://www.w3.org/1999/xhtml", "span");
            var postText = name.substr(prefixLen);
            post.textContent = postText;
            post.classList.add("completionText");

            if (i === selIndex)
                this.selectedPopupElement = hbox;

            if (completion.type === CompletionType.API)
            {
                hbox.classList.add("apiCompletion");

                if (!separatorInserted)
                {
                    var separator = this.completionPopup.ownerDocument.
                        createElementNS("http://www.w3.org/1999/xhtml", "div");
                    separator.textContent = Locale.$STR("console.Firebug_Command_Line_API");
                    separator.classList.add("fbPopupSeparator");
                    vbox.appendChild(separator);

                    separatorInserted = true;
                }
            }

            if (completion.type === CompletionType.API)
                hbox.classList.add("cmd");
            else
                hbox.classList.add("dom");

            hbox.appendChild(pre);
            hbox.appendChild(post);
            vbox.appendChild(hbox);
        }

        if (this.selectedPopupElement)
            this.selectedPopupElement.setAttribute("selected", "true");

        // Open the popup at the pixel position of the start of the completed
        // expression. The text length times the width of a single character,
        // plus apparent padding, is a good enough approximation of this.
        var chWidth = this.getCharWidth(this.completionBase.pre);
        var offsetX = Math.round(this.completionBase.pre.length * chWidth) + 2;

        // xxxHonza: needs to be properly calculated
        offsetX -= 5;

        this.completionPopup.openPopup(this.textBox, "before_start", offsetX, 0, false, false);
    };

    this.getCharWidth = function(text)
    {
        var size = Firebug.textSize;
        if (!measureCache[size])
        {
            var measurer = this.options.popupMeasurer;
            measurer.style.fontSizeAdjust = this.textBox.style.fontSizeAdjust;
            measureCache[size] = measurer.offsetWidth / 60;
        }
        return measureCache[size];
    };

    this.isPopupOpen = function()
    {
        return (this.completionPopup && this.completionPopup.state !== "closed");
    };

    this.closePopup = function()
    {
        if (!this.isPopupOpen())
            return;

        try
        {
            this.completionPopup.hidePopup();
            this.selectedPopupElement = null;
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("JSAutoCompleter.closePopup; EXCEPTION " + err, err);
        }
    };

    this.getCompletionPopupElementFromEvent = function(event)
    {
        var selected = event.target;
        while (selected && selected.localName !== "div")
            selected = selected.parentNode;

        return (selected && typeof selected.completionIndex !== "undefined" ? selected : null);
    };

    this.popupMousedown = function(event)
    {
        var el = this.getCompletionPopupElementFromEvent(event);
        if (!el)
            return;

        if (this.selectedPopupElement)
            this.selectedPopupElement.removeAttribute("selected");

        this.selectedPopupElement = el;
        this.selectedPopupElement.setAttribute("selected", "true");
        this.completions.index = el.completionIndex;
        this.completionBox.value = this.getCompletionBoxValue();
    };

    this.popupScroll = function(event)
    {
        if (event.axis !== event.VERTICAL_AXIS)
            return;
        if (!this.getCompletionPopupElementFromEvent(event))
            return;
        this.cycle(event.detail, true);
    };

    this.popupClick = function(event)
    {
        var el = this.getCompletionPopupElementFromEvent(event);
        if (!el)
            return;

        this.completions.index = el.completionIndex;
        this.acceptCompletion();
    };

    this.popupMousedown = Obj.bind(this.popupMousedown, this);
    this.popupScroll = Obj.bind(this.popupScroll, this);
    this.popupClick = Obj.bind(this.popupClick, this);

    /**
     * A destructor function, to be called when the auto-completer is destroyed.
     */
    this.shutdown = function()
    {
        this.completionBox.value = "";

        if (this.completionPopup)
        {
            Events.removeEventListener(this.completionPopup, "mousedown", this.popupMousedown, true);
            Events.removeEventListener(this.completionPopup, "DOMMouseScroll", this.popupScroll, true);
            Events.removeEventListener(this.completionPopup, "click", this.popupClick, true);
        }
    };

    if (this.completionPopup)
    {
        Events.addEventListener(this.completionPopup, "mousedown", this.popupMousedown, true);
        Events.addEventListener(this.completionPopup, "DOMMouseScroll", this.popupScroll, true);
        Events.addEventListener(this.completionPopup, "click", this.popupClick, true);
    }
};

/**
 * Transform expressions that use .% into more JavaScript-friendly function calls.
 * (This is unrelated to the auto-completer, but autoCompleter.js has so many nice
 * helper functions.)
 */
JSAutoCompleter.transformScopeOperator = function(expr, fname)
{
    var sexpr = simplifyExpr(expr, false);
    if (!sexpr)
        return expr;
    var search = 0;
    for (;;)
    {
        // Find the next occurrance of .%.
        var end = sexpr.indexOf(".%", search);
        if (end === -1)
            break;

        var start = getExpressionOffset(sexpr, end);
        if (/^-?[0-9]*$/.test(expr.substring(start, end)))
        {
            // False alarm - the operator was actually a number and the modulo operator.
            search = end + 1;
        }
        else
        {
            // Substitute "expr.%prop" with "scopeGetter(expr).prop", or, if used
            // in a "new" expression, "(scopeGetter(expr)).prop" (so that the scope
            // getter isn't used as a constructor). We don't want to use the second
            // thing unconditionally though, because it messes with ASI.
            var newPos = (start === 0 ? -1 : sexpr.lastIndexOf("new", start-1));
            var hasNew = (newPos !== -1 && !/[a-zA-Z0-9_$.]/.test(sexpr.charAt(newPos-1)) &&
                sexpr.substring(newPos + 3, start).trim() === "");
            var subst = function(expr)
            {
                return expr.substr(0, start) + (hasNew ? "(" : "") + fname + "(" +
                    expr.substring(start, end) + ")" + (hasNew ? ")" : "") + "." +
                    expr.substr(end+2);
            };
            expr = subst(expr);
            sexpr = subst(sexpr);

            search = end + fname.length + (hasNew ? 5 : 3); // |(()).| or |().|
        }
    }
    return expr;
};

// ********************************************************************************************* //
// CodeMirror auto-completer

function codeMirrorAutoComplete(context, allowGlobal, attemptedCompletionOut, sourceEditor, editor)
{
    var cur = editor.getCursor(), line = cur.line;
    var token = editor.getTokenAt(cur);
    if (["comment", "string", "string-2"].indexOf(token.type) !== -1)
        return;

    var offset = token.end;
    var wholeLine = editor.getLine(line);
    var value = wholeLine.substr(0, offset);

    var options = {
        includeCommandLineAPI: true,
        includeCurrentScope: true,
        multiLine: true,
        get additionalGlobalCompletions()
        {
            return sourceEditor.getSurroundingVariablesFromCodeMirrorState(token.state);
        }
    };
    var completer = new JSAutoCompleter(null, null, options);
    var worked = completer.createCandidates(context, value, value.length, allowGlobal);
    if (!worked)
        return;

    attemptedCompletionOut.attemptedCompletion = true;
    if (!completer.completions)
        return;

    var applyCompletion = function(cm, data, completion)
    {
        completer.completions.index = completion.index;
        var startOfLine = completer.getCompletionValue();
        cm.setLine(line, startOfLine + wholeLine.substr(offset));
        cm.setCursor(line, startOfLine.length);
    };
    var cmCompletions = [];
    var list = completer.completions.list;
    for (var i = 0; i < list.length; i++)
    {
        cmCompletions.push({
            hint: applyCompletion,
            text: list[i].name,
            index: i
        });
    }

    var completionIncludesToken = reJSChar.test(token.string.charAt(0));
    var pos = {line: line, ch: completionIncludesToken ? token.start : token.end};
    return {list: cmCompletions, from: pos, to: pos};
}

// ********************************************************************************************* //
// Auto-completion helpers

/**
 * Try to find the position at which the expression to be completed starts.
 */
function getExpressionOffset(command, start)
{
    if (typeof start === "undefined")
        start = command.length;

    var bracketCount = 0, instr = false;

    // When completing []-accessed properties, start instead from the last [.
    var lastBr = command.lastIndexOf("[", start);
    if (lastBr !== -1 && /^" *$/.test(command.substring(lastBr+1, start)))
        start = lastBr;

    for (var i = start-1; i >= 0; --i)
    {
        var c = command[i];
        if (reOpenBracket.test(c))
        {
            if (bracketCount)
                --bracketCount;
            else
                break;
        }
        else if (reCloseBracket.test(c))
        {
            var next = command[i + 1];
            if (bracketCount === 0 && next !== "." && next !== "[")
                break;
            else
                ++bracketCount;
        }
        else if (bracketCount === 0)
        {
            if (c === '"') instr = !instr;
            else if (instr || reJSChar.test(c) || c === "." ||
                (c === "%" && command[i-1] === "."))
                ;
            else
                break;
        }
    }
    ++i;

    // The 'new' operator has higher precedence than function calls, so, if
    // present, it should be included if the expression contains a parenthesis.
    var ind = command.indexOf("(", i+1);
    if (i-4 >= 0 && ind !== -1 && ind < start && command.substr(i-4, 4) === "new ")
    {
        i -= 4;
    }

    return i;
}

/**
 * Try to find the position at which the property name of the final property
 * access in an expression starts (for example, 2 in 'a.b').
 */
function getPropertyOffset(expr)
{
    var lastBr = expr.lastIndexOf("[");
    if (lastBr !== -1 && /^" *$/.test(expr.substr(lastBr+1)))
        return lastBr+2;

    var lastDot = expr.lastIndexOf(".");
    if (lastDot !== -1 && expr.charAt(lastDot+1) === "%")
        return lastDot+2;

    return (lastDot === -1 ? 0 : lastDot+1);
}

/**
 * Get the index of the last non-whitespace character in the range [0, from)
 * in str, or -1 if there is none.
 */
function prevNonWs(str, from)
{
    for (var i = from-1; i >= 0; --i)
    {
        if (str.charAt(i) !== " ")
            return i;
    }
    return -1;
}

/**
 * Find the start of a word consisting of characters matching reJSChar, if
 * str[from] is the last character in the word. (This can be used together
 * with prevNonWs to traverse words backwards from a position.)
 */
function prevWord(str, from)
{
    for (var i = from-1; i >= 0; --i)
    {
        if (!reJSChar.test(str.charAt(i)))
            return i+1;
    }
    return 0;
}

/**
 * Check if a position 'pos', marking the start of a property name, is
 * preceded by a function-declaring keyword.
 */
function isFunctionName(expr, pos)
{
    var ind = prevNonWs(expr, pos);
    if (ind === -1 || !reJSChar.test(expr.charAt(ind)))
        return false;
    var word = expr.substring(prevWord(expr, ind), ind+1);
    return (word === "function" || word === "get" || word === "set");
}

function bwFindMatchingParen(expr, from)
{
    var bcount = 1;
    for (var i = from-1; i >= 0; --i)
    {
        if (reCloseBracket.test(expr.charAt(i)))
            ++bcount;
        else if (reOpenBracket.test(expr.charAt(i)))
            if (--bcount === 0)
                return i;
    }
    return -1;
}

/**
 * Check if a '/' at the end of 'expr' would be a regex or a division.
 * May also return null if the expression seems invalid.
 */
function endingDivIsRegex(expr, multiLine)
{
    var kwCont = ["function", "if", "while", "for", "switch", "catch", "with"];

    var ind = prevNonWs(expr, expr.length);
    if (ind === -1 && multiLine)
        return false;
    var ch = (ind === -1 ? "{" : expr.charAt(ind));
    if (reJSChar.test(ch))
    {
        // Test if the previous word is a keyword usable like 'kw <expr>'.
        // If so, we have a regex, otherwise, we have a division (a variable
        // or literal being divided by something).
        var w = expr.substring(prevWord(expr, ind), ind+1);
        return (kwActions.indexOf(w) !== -1 || w === "do" || w === "else");
    }
    else if (ch === ")")
    {
        // We have a regex in the cases 'if (...) /blah/' and 'function name(...) /blah/'.
        ind = bwFindMatchingParen(expr, ind);
        if (ind === -1)
            return (multiLine ? false : null);
        ind = prevNonWs(expr, ind);
        if (ind === -1)
            return false;
        if (!reJSChar.test(expr.charAt(ind)))
            return false;
        var wind = prevWord(expr, ind);
        if (kwCont.indexOf(expr.substring(wind, ind+1)) !== -1)
            return true;
        return isFunctionName(expr, wind);
    }
    else if (ch === "]")
    {
        return false;
    }
    return true;
}

// Check if a "{" in an expression is an object declaration.
function isObjectDecl(expr, pos)
{
    var ind = prevNonWs(expr, pos);
    if (ind === -1)
        return false;
    var ch = expr.charAt(ind);
    if (ch === ")" || ch === "{" || ch === "}" || ch === ";")
        return false;
    if (!reJSChar.test(ch))
        return true;
    var w = expr.substring(prevWord(expr, ind), ind+1);
    return (kwActions.indexOf(w) !== -1);
}

function isCommaProp(expr, start)
{
    var beg = expr.lastIndexOf(",")+1;
    if (beg < start)
        beg = start;
    while (expr.charAt(beg) === " ")
        ++beg;
    var prop = expr.substr(beg);
    return isValidProperty(prop);
}

function simplifyExpr(expr, multiLine)
{
    var ret = "", len = expr.length, instr = false, strend, inreg = false, inclass, brackets = [];

    for (var i = 0; i < len; ++i)
    {
        var ch = expr.charAt(i);
        if (instr)
        {
            if (ch === strend)
            {
                ret += '"';
                instr = false;
            }
            else
            {
                if (ch === "\\" && i+1 !== len)
                {
                    ret += " ";
                    ++i;
                }
                ret += " ";
            }
        }
        else if (inreg)
        {
            if (inclass && ch === "]")
                inclass = false;
            else if (!inclass && ch === "[")
                inclass = true;
            else if (!inclass && ch === "/")
            {
                // End of regex, eat regex flags
                inreg = false;
                while (i+1 !== len && reJSChar.test(expr.charAt(i+1)))
                {
                    ret += " ";
                    ++i;
                }
                ret += '"';
            }
            if (inreg)
            {
                if (ch === "\\" && i+1 !== len)
                {
                    ret += " ";
                    ++i;
                }
                ret += " ";
            }
        }
        else
        {
            if (ch === "'" || ch === '"')
            {
                instr = true;
                strend = ch;
                ret += '"';
            }
            else if (ch === "/")
            {
                if (i + 1 < expr.length && /[\/\*]/.test(expr.charAt(i + 1)))
                {
                    var singleLineComment = (expr.charAt(i + 1) === "/");
                    ret += "  ";
                    i += 2;
                    var re = singleLineComment ? /^\n/ : /\*\//;
                    while (i < len && !re.test(expr.substr(i, 2)))
                    {
                        ret += " ";
                        i++;
                    }
                    if (!singleLineComment && i < len)
                    {
                        ret += "  ";
                        i += 2;
                    }
                    i--;
                }
                else
                {
                    var re = endingDivIsRegex(ret, multiLine);
                    if (re === null)
                        return null;
                    if (re)
                    {
                        inreg = true;
                        ret += '"';
                    }
                    else
                        ret += "/";
                }
            }
            else
            {
                if (reOpenBracket.test(ch))
                    brackets.push(ch);
                else if (reCloseBracket.test(ch) && brackets.length)
                {
                    // Check for mismatched brackets
                    var br = brackets.pop();
                    if (br === "(" && ch !== ")")
                        return null;
                    if (br === "[" && ch !== "]")
                        return null;
                    if (br === "{" && ch !== "}")
                        return null;
                }
                ret += ch;
            }
        }
    }

    return ret;
}

// Check if auto-completion should be killed.
function killCompletions(expr, origExpr, force)
{
    if (expr.length === 0)
        return !force;

    if (reJSChar.test(expr[expr.length-1]) ||
            expr.slice(-1) === "." ||
            expr.slice(-2) === ".%")
    {
        // An expression at the end - we're fine.
    }
    else
    {
        var lastBr = expr.lastIndexOf("[");
        if (lastBr !== -1 && /^" *$/.test(expr.substr(lastBr+1)) &&
            origExpr.charAt(lastBr+1) !== "/")
        {
            // Array completions - we're fine.
        }
        else {
            return !force;
        }
    }

    // Check for 'function i'.
    var ind = expr.lastIndexOf(" ");
    if (isValidProperty(expr.substr(ind+1)) && isFunctionName(expr, ind+1))
        return true;

    // Check for '{prop: ..., i'.
    var bwp = bwFindMatchingParen(expr, expr.length);
    if (bwp !== -1 && expr.charAt(bwp) === "{" &&
            isObjectDecl(expr, bwp) && isCommaProp(expr, bwp+1))
    {
        return true;
    }

    // Check for 'var prop..., i'.
    var vind = expr.lastIndexOf("var ");
    if (bwp < vind && isCommaProp(expr, vind+4))
    {
        // Note: This doesn't strictly work, because it kills completions even
        // when we have started a new expression and used the comma operator
        // in it (ie. 'var a; a, i'). This happens very seldom though, so it's
        // not really a problem.
        return true;
    }

    // Check for 'function f(i'.
    while (bwp !== -1 && expr.charAt(bwp) !== "(")
    {
        bwp = bwFindMatchingParen(expr, bwp);
    }
    if (bwp !== -1)
    {
        var ind = prevNonWs(expr, bwp);
        if (ind !== -1 && reJSChar.test(expr.charAt(ind)))
        {
            var stw = prevWord(expr, ind);
            if (expr.substring(stw, ind+1) === "function")
                return true;
            if (isFunctionName(expr, stw))
                return true;
        }
    }
    return false;
}

// Types the autocompletion knows about, some of their non-enumerable properties,
// and the return types of some member functions.

var AutoCompletionKnownTypes = {
    "void": {
        "_fb_ignorePrototype": true
    },
    "Array": {
        "pop": "|void",
        "push": "|void",
        "shift": "|void",
        "unshift": "|void",
        "reverse": "|Array",
        "sort": "|Array",
        "splice": "|Array",
        "concat": "|Array",
        "slice": "|Array",
        "join": "|String",
        "indexOf": "|Number",
        "lastIndexOf": "|Number",
        "filter": "|Array",
        "map": "|Array",
        "reduce": "|void",
        "reduceRight": "|void",
        "every": "|void",
        "forEach": "|void",
        "some": "|void",
        "length": "Number"
    },
    "String": {
        "_fb_contType": "String",
        "split": "|Array",
        "substr": "|String",
        "substring": "|String",
        "charAt": "|String",
        "charCodeAt": "|String",
        "concat": "|String",
        "indexOf": "|Number",
        "lastIndexOf": "|Number",
        "localeCompare": "|Number",
        "match": "|Array",
        "search": "|Number",
        "slice": "|String",
        "replace": "|String",
        "toLowerCase": "|String",
        "toLocaleLowerCase": "|String",
        "toUpperCase": "|String",
        "toLocaleUpperCase": "|String",
        "trim": "|String",
        "length": "Number"
    },
    "RegExp": {
        "test": "|void",
        "exec": "|Array",
        "lastIndex": "Number",
        "ignoreCase": "void",
        "global": "void",
        "multiline": "void",
        "source": "String"
    },
    "Date": {
        "getTime": "|Number",
        "getYear": "|Number",
        "getFullYear": "|Number",
        "getMonth": "|Number",
        "getDate": "|Number",
        "getDay": "|Number",
        "getHours": "|Number",
        "getMinutes": "|Number",
        "getSeconds": "|Number",
        "getMilliseconds": "|Number",
        "getUTCFullYear": "|Number",
        "getUTCMonth": "|Number",
        "getUTCDate": "|Number",
        "getUTCDay": "|Number",
        "getUTCHours": "|Number",
        "getUTCMinutes": "|Number",
        "getUTCSeconds": "|Number",
        "getUTCMilliseconds": "|Number",
        "setTime": "|void",
        "setYear": "|void",
        "setFullYear": "|void",
        "setMonth": "|void",
        "setDate": "|void",
        "setHours": "|void",
        "setMinutes": "|void",
        "setSeconds": "|void",
        "setMilliseconds": "|void",
        "setUTCFullYear": "|void",
        "setUTCMonth": "|void",
        "setUTCDate": "|void",
        "setUTCHours": "|void",
        "setUTCMinutes": "|void",
        "setUTCSeconds": "|void",
        "setUTCMilliseconds": "|void",
        "toUTCString": "|String",
        "toLocaleDateString": "|String",
        "toLocaleTimeString": "|String",
        "toLocaleFormat": "|String",
        "toDateString": "|String",
        "toTimeString": "|String",
        "toISOString": "|String",
        "toGMTString": "|String",
        "toJSON": "|String",
        "toString": "|String",
        "toLocaleString": "|String",
        "getTimezoneOffset": "|Number"
    },
    "Function": {
        "call": "|void",
        "apply": "|void",
        "length": "Number",
        "prototype": "void"
    },
    "HTMLElement": {
        "getElementsByClassName": "|NodeList",
        "getElementsByTagName": "|NodeList",
        "getElementsByTagNameNS": "|NodeList",
        "querySelector": "|HTMLElement",
        "querySelectorAll": "|NodeList",
        "firstChild": "HTMLElement",
        "lastChild": "HTMLElement",
        "firstElementChild": "HTMLElement",
        "lastElementChild": "HTMLElement",
        "parentNode": "HTMLElement",
        "previousSibling": "HTMLElement",
        "nextSibling": "HTMLElement",
        "previousElementSibling": "HTMLElement",
        "nextElementSibling": "HTMLElement",
        "children": "NodeList",
        "childNodes": "NodeList"
    },
    "NodeList": {
        "_fb_contType": "HTMLElement",
        "length": "Number",
        "item": "|HTMLElement",
        "namedItem": "|HTMLElement"
    },
    "Window": {
        "encodeURI": "|String",
        "encodeURIComponent": "|String",
        "decodeURI": "|String",
        "decodeURIComponent": "|String",
        "eval": "|void",
        "parseInt": "|Number",
        "parseFloat": "|Number",
        "isNaN": "|void",
        "isFinite": "|void",
        "NaN": "Number",
        "Math": "Math",
        "undefined": "void",
        "Infinity": "Number"
    },
    "HTMLDocument": {
        "querySelector": "|HTMLElement",
        "querySelectorAll": "|NodeList"
    },
    "Math": {
        "E": "Number",
        "LN2": "Number",
        "LN10": "Number",
        "LOG2E": "Number",
        "LOG10E": "Number",
        "PI": "Number",
        "SQRT1_2": "Number",
        "SQRT2": "Number",
        "abs": "|Number",
        "acos": "|Number",
        "asin": "|Number",
        "atan": "|Number",
        "atan2": "|Number",
        "ceil": "|Number",
        "cos": "|Number",
        "exp": "|Number",
        "floor": "|Number",
        "log": "|Number",
        "max": "|Number",
        "min": "|Number",
        "pow": "|Number",
        "random": "|Number",
        "round": "|Number",
        "sin": "|Number",
        "sqrt": "|Number",
        "tan": "|Number"
    },
    "Number": {
        "valueOf": "|Number",
        "toFixed": "|String",
        "toExponential": "|String",
        "toPrecision": "|String",
        "toLocaleString": "|String",
        "toString": "|String"
    }
};

var LinkType = {
    "PROPERTY": 0,
    "SCOPED_VARS": 1,
    "INDEX": 2,
    "CALL": 3,
    "RETVAL_HEURISTIC": 4
};

function getKnownType(t)
{
    var known = AutoCompletionKnownTypes;
    if (known.hasOwnProperty(t))
        return known[t];
    return null;
}

function getKnownTypeInfo(r)
{
    if (r.charAt(0) === "|")
        return {"val": "Function", "ret": r.substr(1)};
    return {"val": r};
}

function getFakeCompleteKeys(name)
{
    var ret = [], type = getKnownType(name);
    if (!type)
        return ret;
    for (var prop in type) {
        if (prop.substr(0, 4) !== "_fb_")
            ret.push(prop);
    }
    return ret;
}

function eatProp(expr, start)
{
    for (var i = start; i < expr.length; ++i)
        if (!reJSChar.test(expr.charAt(i)))
            break;
    return i;
}

function matchingBracket(expr, start)
{
    var count = 1;
    for (var i = start + 1; i < expr.length; ++i) {
        var ch = expr.charAt(i);
        if (reOpenBracket.test(ch))
            ++count;
        else if (reCloseBracket.test(ch))
            if (!--count)
                return i;
    }
    return -1;
}

function getTypeExtractionExpression(command)
{
    // Return a JavaScript expression for determining the type / [[Class]] of
    // an object given by another JavaScript expression. For DOM nodes, return
    // HTMLElement instead of HTML[node type]Element, for simplicity.
    var ret = "(function() { var v = " + command + "; ";
    ret += "if (window.HTMLElement && v instanceof HTMLElement) return 'HTMLElement'; ";
    ret += "return Object.prototype.toString.call(v).slice(8, -1);})()";
    return ret;
}

/**
 * Compare two property names a and b with a custom sort order. The comparison
 * is lexicographical, but treats _ as higher than other letters in the
 * beginning of the word, so that:
 *  $ < AutoCompleter < add_widget < additive < _ < _priv < __proto__
 * @return -1, 0 or 1 depending on whether (a < b), (a == b) or (a > b).
 */
function comparePropertyNames(lhs, rhs)
{
    var len = Math.min(lhs.length, rhs.length);
    for (var i = 0; i < len; ++i)
    {
        var u1 = (lhs.charAt(i) === "_");
        var u2 = (rhs.charAt(i) === "_");
        if (!u1 && !u2)
            break;
        if (!u1 || !u2)
            return (u1 ? 1 : -1);
    }

    if (lhs < rhs)
        return -1;
    return (lhs === rhs ? 0 : 1);
}

// See autoCompleteEval. This reorders a sorted array to look as if it had been
// sorted by comparePropertyNames.
function reorderPropertyNames(ar)
{
    var buckets = [];
    for (var i = 0; i < ar.length; ++i)
    {
        var s = ar[i];
        if (s.charAt(0) === "_")
        {
            var count = 0, j = 0;
            while (count < s.length && s.charAt(count) === "_")
                ++count;
            --count;
            if (!buckets[count])
                buckets[count] = [];
            buckets[count].push(s);
        }
    }

    if (!buckets.length)
        return ar;

    var res = [];
    for (var i = 0; i < ar.length; ++i)
    {
        if (ar[i].charAt(0) !== "_")
            res.push(ar[i]);
    }
    for (var i = 0; i < buckets.length; ++i)
    {
        var ar2 = buckets[i];
        if (ar2)
            res.push.apply(res, ar2);
    }
    return res;
}

function propertiesToHide(expr, obj)
{
    var ret = [];

    // __{define,lookup}[SG]etter__ appear as own properties on lots of DOM objects.
    ret.push("__defineGetter__", "__defineSetter__",
        "__lookupGetter__", "__lookupSetter__");

    // function.caller/arguments are deprecated and ugly, and don't hold values when
    // evaluated from the command line.
    if (typeof obj === "function")
        ret.push("caller", "arguments");

    if (Object.prototype.toString.call(obj) === "[object String]")
    {
        // Unused, cluttery.
        ret.push("quote", "bold", "italics", "fixed", "fontsize", "fontcolor",
            "link", "anchor", "strike", "small", "big", "blink", "sup", "sub");
    }

    if (expr === "" || expr === "window.")
    {
        // Internal Firefox things.
        ret.push("getInterface", "Components", "XPCNativeWrapper",
            "InstallTrigger", "WindowInternal", "DocumentXBL",
            "startProfiling", "stopProfiling", "pauseProfilers",
            "resumeProfilers", "dumpProfile", "netscape",
            "BoxObject", "BarProp", "BrowserFeedWriter", "ChromeWindow",
            "ElementCSSInlineStyle", "JSWindow", "NSEditableElement",
            "NSRGBAColor", "NSEvent", "NSXPathExpression", "ToString",
            "OpenWindowEventDetail", "Parser", "ParserJS", "Rect",
            "RGBColor", "ROCSSPrimitiveValue", "RequestService",
            "PaintRequest", "PaintRequestList", "WindowUtils",
            "GlobalPropertyInitializer", "GlobalObjectConstructor"
        );
    }

    // Old and ugly.
    if (expr === "document.")
        ret.push("fgColor", "vlinkColor", "linkColor");
    if (expr === "document.body.")
        ret.push("link", "aLink", "vLink");

    // Rather universal and feel like built-ins.
    ret.push("constructor", "QueryInterface");

    return ret;
}

function setCompletionsFromObject(out, object, context)
{
    // 'object' is a user-level, non-null object.
    try
    {
        var isObjectPrototype = function(obj)
        {
            // Check if an object is "Object.prototype". This isn't as simple
            // as 'obj === context.window.wrappedJSObject.Object.prototype' due
            // to cross-window properties, nor just '!Object.getPrototypeOf(obj)'
            // because of Object.create.
            return !Object.getPrototypeOf(obj) && "hasOwnProperty" in obj;
        };

        var obj = object;
        while (obj !== null)
        {
            var target = (isObjectPrototype(obj) ?
                    out.hiddenCompletions : out.completions);
            if (Array.isArray(obj) && obj.length > 4000)
            {
                // The object is a large array. To avoid RangeErrors from
                // `target.push.apply` and a slow `Object.getOwnPropertyNames`,
                // we just skip this level ("length" is also on the prototype,
                // and numeric property would get hidden later anyway).
            }
            else
            {
                target.push.apply(target, Object.getOwnPropertyNames(obj));
            }
            obj = Object.getPrototypeOf(obj);
        }

        // As a special case, when completing "Object.prototype." no properties
        // should be hidden.
        if (isObjectPrototype(object))
        {
            out.completions = out.hiddenCompletions;
            out.hiddenCompletions = [];
        }
        else
        {
            // Hide a list of well-chosen annoying properties.
            var hide = propertiesToHide(out.spreExpr, object);
            var hideMap = Object.create(null);
            for (var i = 0; i < hide.length; ++i)
                hideMap[hide[i]] = 1;

            var newCompletions = [];
            out.completions.forEach(function(prop)
            {
                if (prop in hideMap)
                    out.hiddenCompletions.push(prop);
                else
                    newCompletions.push(prop);
            });
            out.completions = newCompletions;
        }

        // Firefox hides __proto__ - add it back.
        if ("__proto__" in object)
            out.hiddenCompletions.push("__proto__");
    }
    catch (exc)
    {
        if (FBTrace.DBG_COMMANDLINE)
            FBTrace.sysout("autoCompleter.setCompletionsFromObject failed", exc);
    }
}

function setCompletionsFromScope(out, object, context)
{
    out.completions = ClosureInspector.getClosureVariablesList(object, context);

    // Hide "arguments"; it almost never holds a value.
    out.completions = Arr.unique(out.completions);
    var ind = out.completions.indexOf("arguments");
    if (ind !== -1)
    {
        out.completions.splice(ind, 1);
        out.hiddenCompletions.push("arguments");
    }
}

function getNewlyDeclaredNames(js)
{
    // XXXsimon: In the future, machinery from issue 5291 could perhaps replace this.
    var re = /\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g;
    var ar = [], match;
    while ((match = re.exec(js)) !== null)
    {
        var afterCh = js.substr(re.lastIndex).trimLeft()[0];
        if (/[.%]/.test(js.charAt(match.index - 1)) || !/^[=,;\(\)]/.test(afterCh))
            continue;
        if (afterCh === "(" && !js.slice(0, match.index).endsWith("function "))
            continue;
        if (kwAll.indexOf(match[0]) !== -1)
            continue;

        ar.push(match[0]);
    }
    return ar;
}

function propChainBuildComplete(out, context, tempExpr, result)
{
    if (out.scopeCompletion)
    {
        if (tempExpr.fake)
            return;
        if (typeof result !== "object" && typeof result !== "function")
            return;
        setCompletionsFromScope(out, result, context);
        return;
    }

    var done = function(result)
    {
        if (result == null)
            return;

        if (typeof result !== "object" && typeof result !== "function")
        {
            // To avoid slow completions, convert strings to length 0 (numeric
            // properties are hidden anyway).
            if (typeof result === "string")
                result = "";

            // Convert the primitive into its scope's matching object type.
            result = Wrapper.getContentView(out.window).Object(result);
        }
        setCompletionsFromObject(out, result, context);
    };

    if (tempExpr.fake)
    {
        var name = tempExpr.value.val;
        if (getKnownType(name)._fb_ignorePrototype)
            return;
        var command = name + ".prototype";
        Firebug.CommandLine.evaluate(name + ".prototype", context, context.thisValue, null,
            function found(result, context)
            {
                done(result);
            },
            function failed(result, context) {},
            {noStateChange: true}
        );
    }
    else
    {
        done(result);
    }
}

function evalPropChainStep(step, tempExpr, evalChain, out, context)
{
    if (tempExpr.fake)
    {
        if (step === evalChain.length)
        {
            propChainBuildComplete(out, context, tempExpr);
            return;
        }

        var link = evalChain[step], type = link.type;
        if (type === LinkType.PROPERTY || type === LinkType.INDEX)
        {
            // Use the accessed property if it exists, otherwise abort. It
            // would be possible to continue with a 'real' expression of
            // `tempExpr.value.val`.prototype, but since prototypes seldom
            // contain actual values of things this doesn't work very well.
            var mem = (type === LinkType.INDEX ? "_fb_contType" : link.name);
            var t = getKnownType(tempExpr.value.val);
            if (t.hasOwnProperty(mem))
                tempExpr.value = getKnownTypeInfo(t[mem]);
            else
                return;
        }
        else if (type === LinkType.CALL)
        {
            if (tempExpr.value.ret)
                tempExpr.value = getKnownTypeInfo(tempExpr.value.ret);
            else
                return;
        }
        else
        {
            return;
        }
        evalPropChainStep(step+1, tempExpr, evalChain, out, context);
    }
    else
    {
        var funcCommand = null, link, type;
        while (step !== evalChain.length)
        {
            link = evalChain[step];
            type = link.type;
            if (type === LinkType.PROPERTY)
            {
                tempExpr.thisCommand = tempExpr.command;
                tempExpr.command += "." + link.name;
            }
            else if (type === LinkType.SCOPED_VARS)
            {
                tempExpr.thisCommand = "window";
                tempExpr.command += ".%" + link.name;
            }
            else if (type === LinkType.INDEX)
            {
                tempExpr.thisCommand = "window";
                tempExpr.command += "[" + link.cont + "]";
            }
            else if (type === LinkType.CALL)
            {
                if (link.origCont !== null &&
                     (link.name.substr(0, 3) === "get" ||
                      (link.name.charAt(0) === "$" && link.cont.indexOf(",") === -1)))
                {
                    // Names beginning with get or $ are almost always getters, so
                    // assume we can safely just call it.
                    tempExpr.thisCommand = "window";
                    tempExpr.command += "(" + link.origCont + ")";
                }
                else if (!link.name)
                {
                    // We cannot know about functions without name; try the
                    // heuristic directly.
                    link.type = LinkType.RETVAL_HEURISTIC;
                    evalPropChainStep(step, tempExpr, evalChain, out, context);
                    return;
                }
                else
                {
                    funcCommand = getTypeExtractionExpression(tempExpr.thisCommand);
                    break;
                }
            }
            else if (type === LinkType.RETVAL_HEURISTIC)
            {
                funcCommand = "Function.prototype.toString.call(" + tempExpr.command + ")";
                break;
            }
            ++step;
        }

        var isFunc = (funcCommand !== null), command = (isFunc ? funcCommand : tempExpr.command);
        Firebug.CommandLine.evaluate(command, context, context.thisValue, null,
            function found(result, context)
            {
                if (isFunc)
                {
                    if (type === LinkType.CALL)
                    {
                        if (typeof result !== "string")
                            return;

                        var t = getKnownType(result);
                        if (t && t.hasOwnProperty(link.name))
                        {
                            var propVal = getKnownTypeInfo(t[link.name]);

                            // Make sure the property is a callable function
                            if (!propVal.ret)
                                return;

                            tempExpr.fake = true;
                            tempExpr.value = getKnownTypeInfo(propVal.ret);
                            evalPropChainStep(step+1, tempExpr, evalChain, out, context);
                        }
                        else
                        {
                            // Unknown 'this' type or function name, use
                            // heuristics on the function instead.
                            link.type = LinkType.RETVAL_HEURISTIC;
                            evalPropChainStep(step, tempExpr, evalChain, out, context);
                        }
                    }
                    else if (type === LinkType.RETVAL_HEURISTIC)
                    {
                        if (typeof result !== "string")
                            return;

                        // Perform some crude heuristics for figuring out the
                        // return value of a function based on its contents.
                        // It's certainly not perfect, and it's easily fooled
                        // into giving wrong results,  but it might work in
                        // some common cases.

                        // Check for chaining functions. This is done before
                        // checking for nested functions, because completing
                        // results of member functions containing nested
                        // functions that use 'return this' seems uncommon,
                        // and being wrong is not a huge problem.
                        if (result.indexOf("return this;") !== -1)
                        {
                            tempExpr.command = tempExpr.thisCommand;
                            tempExpr.thisCommand = "window";
                            evalPropChainStep(step+1, tempExpr, evalChain, out, context);
                            return;
                        }

                        // Don't support nested functions.
                        if (result.lastIndexOf("function") !== 0)
                            return;

                        // Check for arrays.
                        if (result.indexOf("return [") !== -1)
                        {
                            tempExpr.fake = true;
                            tempExpr.value = getKnownTypeInfo("Array");
                            evalPropChainStep(step+1, tempExpr, evalChain, out, context);
                            return;
                        }

                        // Check for 'return new Type(...);', and use the
                        // prototype as a pseudo-object for those (since it
                        // is probably not a known type that we can fake).
                        var newPos = result.indexOf("return new ");
                        if (newPos !== -1)
                        {
                            var rest = result.substr(newPos + 11),
                                epos = rest.search(/[^a-zA-Z0-9_$.]/);
                            if (epos !== -1 && /[; \t\n(}]/.test(rest.charAt(epos)))
                            {
                                rest = rest.substring(0, epos);
                                var func = tempExpr.command, expr = rest + ".prototype";
                                tempExpr.command = "(function() { " +
                                    "try { return " + func + ".%" + expr + "; } " +
                                    "catch(e) { return " + expr + "; } " +
                                "})()";
                                evalPropChainStep(step+1, tempExpr, evalChain, out, context);
                                return;
                            }
                        }
                    }
                }
                else
                {
                    propChainBuildComplete(out, context, tempExpr, result);
                }
            },
            function failed(result, context) {},
            {noStateChange: true}
        );
    }
}

function evalPropChain(out, preExpr, origExpr, context)
{
    var evalChain = [], linkStart = 0, len = preExpr.length, lastProp = "";
    var tempExpr = {"fake": false, "command": "window", "thisCommand": "window"};
    while (linkStart !== len)
    {
        var ch = preExpr.charAt(linkStart);
        if (linkStart === 0)
        {
            if (preExpr.substr(0, 4) === "new ")
            {
                var parInd = preExpr.indexOf("(");
                tempExpr.command = preExpr.substring(4, parInd) + ".prototype";
                linkStart = matchingBracket(preExpr, parInd) + 1;
            }
            else if (ch === "[")
            {
                tempExpr.fake = true;
                tempExpr.value = getKnownTypeInfo("Array");
                linkStart = matchingBracket(preExpr, linkStart) + 1;
            }
            else if (ch === '"')
            {
                var isRegex = (origExpr.charAt(0) === "/");
                tempExpr.fake = true;
                tempExpr.value = getKnownTypeInfo(isRegex ? "RegExp" : "String");
                linkStart = preExpr.indexOf('"', 1) + 1;
            }
            else if (!isNaN(ch))
            {
                // The expression is really a decimal number.
                return false;
            }
            else if (reJSChar.test(ch))
            {
                // The expression begins with a regular property name
                var nextLink = eatProp(preExpr, linkStart);
                lastProp = preExpr.substring(linkStart, nextLink);
                linkStart = nextLink;
                tempExpr.command = lastProp;
            }

            // Syntax error (like '.') or a too complicated expression.
            if (linkStart === 0)
                return false;
        }
        else
        {
            if (ch === ".")
            {
                // Property access
                var scope = (preExpr.charAt(linkStart+1) === "%");
                linkStart += (scope ? 2 : 1);
                var nextLink = eatProp(preExpr, linkStart);
                lastProp = preExpr.substring(linkStart, nextLink);
                linkStart = nextLink;
                evalChain.push({
                    "type": (scope ? LinkType.SCOPED_VARS : LinkType.PROPERTY),
                    "name": lastProp
                });
            }
            else if (ch === "(")
            {
                // Function call. Save the function name and the arguments if
                // they are safe to evaluate. Currently literals and single
                // variables not occurring previously on the command line are
                // treated as safe.
                var endCont = matchingBracket(preExpr, linkStart);
                var cont = preExpr.substring(linkStart+1, endCont), origCont = null;
                if (reLiteralExpr.test(cont) || (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cont) &&
                    preExpr.lastIndexOf(cont, linkStart) === -1))
                {
                    origCont = origExpr.substring(linkStart+1, endCont);
                }
                linkStart = endCont + 1;
                evalChain.push({
                    "type": LinkType.CALL,
                    "name": lastProp,
                    "origCont": origCont,
                    "cont": cont
                });

                lastProp = "";
            }
            else if (ch === "[")
            {
                // Index. Use the supplied index if it is a literal; otherwise
                // it is probably a loop index with a variable not yet defined
                // (like 'for(var i = 0; i < ar.length; ++i) ar[i].prop'), and
                // '0' seems like a reasonably good guess at a valid index.
                var endInd = matchingBracket(preExpr, linkStart);
                var ind = preExpr.substring(linkStart+1, endInd);
                if (reLiteralExpr.test(ind))
                    ind = origExpr.substring(linkStart+1, endInd);
                else
                    ind = "0";
                linkStart = endInd+1;
                evalChain.push({"type": LinkType.INDEX, "cont": ind});
                lastProp = "";
            }
            else
            {
                // Syntax error
                return false;
            }
        }
    }

    evalPropChainStep(0, tempExpr, evalChain, out, context);
    return true;
}


var CompletionType = {
    "NORMAL": 0,
    "API": 1
};

function autoCompleteEval(context, preExpr, spreExpr, preParsed, spreParsed, options)
{
    var out = {
        spreExpr: spreExpr,
        completions: [],
        hiddenCompletions: [],
        window: context.getCurrentGlobal()
    };
    var indexCompletion = false;

    try
    {
        if (spreExpr)
        {
            // Complete member variables of some .-chained expression

            // In case of array indexing, remove the bracket and set a flag to
            // escape completions.
            out.scopeCompletion = false;
            var len = spreExpr.length;
            if (len >= 2 && spreExpr[len-2] === "[" && spreExpr[len-1] === '"')
            {
                indexCompletion = true;
                out.indexQuoteType = preExpr[len-1];
                len -= 2;
            }
            else if (spreExpr.slice(-2) === ".%")
            {
                out.scopeCompletion = true;
                len -= 2;
            }
            else
            {
                len -= 1;
            }
            spreExpr = spreExpr.substr(0, len);
            preExpr = preExpr.substr(0, len);

            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("commandLine.autoCompleteEval pre:'" + preExpr +
                    "' spre:'" + spreExpr + "'.");

            // Don't auto-complete '.'.
            if (spreExpr === "")
                return out;

            evalPropChain(out, spreExpr, preExpr, context);
        }
        else
        {
            // Complete variables from the local scope

            var contentView = Wrapper.getContentView(out.window);
            setCompletionsFromObject(out, contentView, context);

            if (context.stopped && options.includeCurrentScope)
            {
                var localVars = Firebug.Debugger.getCurrentFrameKeys(context);
                out.completions = out.completions.concat(localVars, ["this"]);
            }
        }

        if (options.additionalCompletions)
            out.completions.push.apply(out.completions, options.additionalCompletions);

        if (indexCompletion)
        {
            // If we are doing index-completions, add "] to everything.
            var convertQuotes = function(x)
            {
                x = (out.indexQuoteType === '"') ? Str.escapeJS(x): Str.escapeSingleQuoteJS(x);
                return x + out.indexQuoteType + "]";
            }

            out.completions = out.completions.map(convertQuotes);
            out.hiddenCompletions = out.hiddenCompletions.map(convertQuotes);
        }
        else if (out.completions.indexOf("length") !== -1 && out.completions.indexOf("0") !== -1)
        {
            // ... otherwise remove numeric keys from array-like things.
            var rePositiveNumber = /^[1-9][0-9]*$/;
            out.completions = out.completions.filter(function(x)
            {
                return !rePositiveNumber.test(x) && x !== "0";
            });
        }

        // Sort the completions, and avoid duplicates.
        // Note: If we make it possible to show both regular and hidden completions
        // at the same time, completions should shadow hiddenCompletions here.
        // XXX Normally we'd just do sortUnique(completions, comparePropertyNames),
        // but JSD makes that slow (issue 6256). Sort and do manual reordering instead.
        out.completions = reorderPropertyNames(Arr.sortUnique(out.completions));
        out.hiddenCompletions = reorderPropertyNames(Arr.sortUnique(out.hiddenCompletions));

        var wrap = function(x)
        {
            return {type: CompletionType.NORMAL, name: x};
        };
        out.completions = out.completions.map(wrap);
        out.hiddenCompletions = out.hiddenCompletions.map(wrap);

        // Add things from the Command Line API, if we are signalled to,
        // and it is not unavailable due to being stopped in the debugger
        // (issue 5321).
        if (!spreExpr && options.includeCommandLineAPI)
        {
            var usedNames = new Set();
            out.completions.forEach(function(completion)
            {
                usedNames.add(completion.name);
            });
            CommandLineExposed.getAutoCompletionList().forEach(function(name)
            {
                if (!usedNames.has(name))
                    out.completions.push({type: CompletionType.API, name: name});
            });
        }
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS && FBTrace.DBG_COMMANDLINE)
            FBTrace.sysout("commandLine.autoCompleteEval FAILED", exc);
    }
    return out;
}

var reValidJSToken = /^[A-Za-z_$][A-Za-z_$0-9]*$/;
function isValidProperty(value)
{
    // Use only string props
    if (typeof(value) != "string")
        return false;

    // Use only those props that don't contain unsafe charactes and so need
    // quotation (e.g. object["my prop"] notice the space character).
    // Following expression checks that the name starts with a letter or $_,
    // and there are only letters, numbers or $_ character in the string (no spaces).

    return reValidJSToken.test(value);
}

function setCursorToEOL(input)
{
    // textbox version, https://developer.mozilla.org/en/XUL/Property/inputField
    // input.inputField.setSelectionRange(len, len);
    input.setSelectionRange(input.value.length, input.value.length);
}

// ********************************************************************************************* //
// Registration

JSAutoCompleter.codeMirrorAutoComplete = codeMirrorAutoComplete;
Firebug.JSAutoCompleter = JSAutoCompleter;

return JSAutoCompleter;

// ********************************************************************************************* //
});
