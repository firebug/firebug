/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/wrapper",
    "firebug/lib/dom",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/editor/editor"
],
function(Obj, Firebug, Domplate, FirebugReps, Locale, Events, Wrapper, Dom, Str, Arr, Editor) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const reOpenBracket = /[\[\(\{]/;
const reCloseBracket = /[\]\)\}]/;
const reJSChar = /[a-zA-Z0-9$_]/;
const reLiteralExpr = /^[ "0-9,]*$/;

// ********************************************************************************************* //
// JavaScript auto-completion

Firebug.JSAutoCompleter = function(textBox, completionBox, options)
{
    var popupSize = 40;

    this.textBox = textBox;
    this.options = options;

    this.completionBox = completionBox;
    this.popupTop = this.popupBottom = null;

    this.completionBase = {
        pre: null,
        expr: null,
        candidates: []
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
            candidates: []
        };
        this.completions = null;

        this.showCompletions(false);
    };

    /**
     * Hide completions for this expression (/completion base). Appending further
     * characters to the variable name will not make completions appear, but
     * adding, say, a semicolon and typing something else will.
     */
    this.hideForExpression = function()
    {
        this.completionBase.candidates = [];
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
    this.complete = function(context)
    {
        this.revertValue = null;
        this.createCandidates(context);
        this.showCompletions(false);
    };

    /**
     * Update the completion base and create completion candidates for the
     * current value of the text box.
     */
    this.createCandidates = function(context)
    {
        var offset = this.textBox.selectionStart;
        if (offset !== this.textBox.value.length)
        {
            this.hide();
            return;
        }

        var value = this.textBox.value;

        // Create a simplified expression by redacting contents/normalizing
        // delimiters of strings and regexes, to make parsing easier.
        // Give up if the syntax is too weird.
        var svalue = simplifyExpr(value);
        if (svalue === null)
        {
            this.hide();
            return;
        }

        if (killCompletions(svalue, value))
        {
            this.hide();
            return;
        }

        // Find the expression to be completed.
        var parseStart = getExpressionOffset(svalue);
        var parsed = value.substr(parseStart);
        var sparsed = svalue.substr(parseStart);

        // Find which part of it represents the property access.
        var propertyStart = getPropertyOffset(sparsed);
        var prop = parsed.substring(propertyStart);
        var spreExpr = sparsed.substr(0, propertyStart);
        var preExpr = parsed.substr(0, propertyStart);

        this.completionBase.pre = value.substr(0, parseStart);

        if (FBTrace.DBG_COMMANDLINE)
        {
            var sep = (parsed.indexOf("|") > -1) ? "^" : "|";
            FBTrace.sysout("Completing: " + this.completionBase.pre + sep + preExpr + sep + prop);
        }

        // We only need to calculate a new candidate list if the expression has
        // changed (we can ignore this.completionBase.pre since completions do not
        // depend upon that).
        if (preExpr !== this.completionBase.expr)
        {
            this.completionBase.expr = preExpr;
            this.completionBase.candidates = autoCompleteEval(context, preExpr, spreExpr,
                this.options.includeCurrentScope);
        }

        this.createCompletions(prop);
    };

    /**
     * From a valid completion base, create a list of completions (containing
     * those completion candidates that share a (sometimes case-insensitive)
     * prefix with the user's input) and a default completion.
     */
    this.createCompletions = function(prefix)
    {
        var candidates = this.completionBase.candidates;
        var valid = [], ciValid = [];

        if (!this.completionBase.expr && !prefix)
        {
            // Don't complete "".
            this.completions = null;
            return;
        }

        var lowPrefix = prefix.toLowerCase();
        for (var i = 0; i < candidates.length; ++i)
        {
            // Mark a candidate as matching if it matches the prefix case-
            // insensitively, and shares its upper-case characters.
            var name = candidates[i];
            if (!Str.hasPrefix(name.toLowerCase(), lowPrefix))
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
                ciValid.push(name);
                if (Str.hasPrefix(name, prefix))
                    valid.push(name);
            }
        }

        if (ciValid.length > 0)
        {
            // If possible, default to a candidate matching the case by picking
            // a default from 'valid' and correcting its index.
            var hasMatchingCase = (valid.length > 0);

            this.completions = {
                list: (hasMatchingCase ? valid : ciValid),
                prefix: prefix
            };
            this.pickDefaultCandidate();

            if (hasMatchingCase)
            {
                var find = valid[this.completions.index];
                this.completions = {
                    list: ciValid,
                    prefix: prefix,
                    index: ciValid.indexOf(find)
                };
            }
        }
        else
        {
            this.completions = null;
        }
    };

    /**
     * Chose a default candidate from the list of completions. This is currently
     * selected as the shortest completion, to make completions disappear when
     * typing a variable name that is also the prefix of another.
     */
    this.pickDefaultCandidate = function()
    {
        var pick = 0;
        var ar = this.completions.list;
        for (var i = 1; i < ar.length; i++)
        {
            if (ar[i].length < ar[pick].length)
                pick = i;
        }
        this.completions.index = pick;
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
        return (this.completions ? this.completions.list[this.completions.index] : null);
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
        return userTyped + value.substr(userTyped.length);
    };

    /**
     * Update the completion box and popup to be consistent with the current
     * state of the auto-completer. If just cycling, the old scolling state
     * for the popup is preserved.
     */
    this.showCompletions = function(cycling)
    {
        this.completionBox.value = this.getCompletionBoxValue();

        var show = this.showCompletionPopup ||
            (this.completionPopup && this.completionPopup.state === "open");
        if (show && this.completions && this.completions.list.length > 1)
            this.popupCandidates(cycling);
        else
            this.closePopup();
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
        else if (event.keyCode === KeyEvent.DOM_VK_ESCAPE)
        {
            if (this.completions)
            {
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
            // (Unless the popup is only open due to Ctrl+Space, in which case
            // that's precisely what we want.)
            if (this.showCompletionPopup)
                this.closePopup();
        }
        else if (event.keyCode === KeyEvent.DOM_VK_SPACE && Events.isControl(event))
        {
            // Force-show the completion popup.
            if (!this.completions)
            {
                // If completions have been hidden, show them again.
                this.hide();
                this.complete(context);
            }
            if (this.completionPopup && this.completions)
                this.popupCandidates(false);
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
        this.completionBox.value = this.textBox.value + "    " +
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
        var list = this.completions.list, selIndex = this.completions.index;

        if (!this.isPopupOpen())
        {
            // When no popup is open, cycle by a fixed amount and stop at edges.
            this.cycle(dir * 15, true);
            return;
        }

        var top = this.popupTop, bottom = this.popupBottom;
        if (top === 0 && bottom === list.length)
        {
            // For a single scroll page, act like home/end.
            this.topCycle(dir);
            return;
        }

        var immediateTarget;
        if (dir === -1)
            immediateTarget = (top === 0 ? top : top + 2);
        else
            immediateTarget = (bottom === list.length ? bottom: bottom - 2) - 1;
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
            else if (dir === 1 && bottom + popupSize >= list.length)
                selIndex = list.length - 1;
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
        this.completionPopup.appendChild(vbox);
        vbox.classList.add("fbCommandLineCompletions");

        var title = this.completionPopup.ownerDocument.
            createElementNS("http://www.w3.org/1999/xhtml","div");
        title.innerHTML = Locale.$STR("console.Use Arrow keys, Tab or Enter");
        title.classList.add("fbPopupTitle");
        vbox.appendChild(title);

        var list = this.completions.list, selIndex = this.completions.index;

        if (this.completions.list.length <= popupSize)
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

        for (var i = this.popupTop; i < this.popupBottom; i++)
        {
            var completion = list[i];
            var prefixLen = this.completions.prefix.length;

            var hbox = this.completionPopup.ownerDocument.
                createElementNS("http://www.w3.org/1999/xhtml","div");
            hbox.completionIndex = i;

            var pre = this.completionPopup.ownerDocument.
                createElementNS("http://www.w3.org/1999/xhtml","span");
            var preText = this.textBox.value;
            if (prefixLen)
                preText = preText.slice(0, -prefixLen) + completion.slice(0, prefixLen);
            pre.innerHTML = Str.escapeForTextNode(preText);
            pre.classList.add("userTypedText");

            var post = this.completionPopup.ownerDocument.
                createElementNS("http://www.w3.org/1999/xhtml","span");
            var postText = completion.substr(prefixLen);
            post.innerHTML = Str.escapeForTextNode(postText);
            post.classList.add("completionText");

            if (i === selIndex)
                this.selectedPopupElement = hbox;

            hbox.appendChild(pre);
            hbox.appendChild(post);
            vbox.appendChild(hbox);
        }

        if (this.selectedPopupElement)
            this.selectedPopupElement.setAttribute("selected", "true");

        this.completionPopup.openPopup(this.textBox, "before_start", 0, 0, false, false);
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
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("Firebug.JSAutoCompleter.closePopup; EXCEPTION " + err, err);
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

// ********************************************************************************************* //

/**
 * A dummy auto-completer, set as current by CommandLine.setAutoCompleter when
 * no completion is supposed to be done (such as in the large command line,
 * currently, or when there is no context).
 */
Firebug.EmptyJSAutoCompleter = function()
{
    this.empty = true;
    this.shutdown = function() {};
    this.hide = function() {};
    this.complete = function() {};
    this.acceptReturn = function() { return true; };
    this.revert = function() { return false; };
    this.handleKeyDown = function() {};
    this.handleKeyPress = function() {};
};

// ********************************************************************************************* //

/**
 * An (abstract) editor with simple JavaScript auto-completion.
 */
Firebug.JSEditor = function()
{
};

with (Domplate) {
Firebug.JSEditor.prototype = domplate(Firebug.InlineEditor.prototype,
{
    setupCompleter: function(completionBox, options)
    {
        this.tabNavigation = false;
        this.arrowCompletion = false;
        this.fixedWidth = true;
        this.completionBox = completionBox;

        this.autoCompleter = new EditorJSAutoCompleter(this.input, this.completionBox, options);
    },

    updateLayout: function()
    {
        // Make sure the completion box stays in sync with the input box.
        Firebug.InlineEditor.prototype.updateLayout.apply(this, arguments);
        this.completionBox.style.width = this.input.style.width;
        this.completionBox.style.height = this.input.style.height;
    },

    destroy: function()
    {
        this.autoCompleter.destroy();
        Firebug.InlineEditor.prototype.destroy.call(this);
    },

    onKeyPress: function(event)
    {
        var context = this.panel.context;

        if (this.getAutoCompleter().handleKeyPress(event, context))
            return;

        if (event.keyCode === KeyEvent.DOM_VK_TAB ||
            event.keyCode === KeyEvent.DOM_VK_RETURN)
        {
            Firebug.Editor.stopEditing();
            Events.cancelEvent(event);
        }
    },

    onInput: function()
    {
        var context = this.panel.context;
        this.getAutoCompleter().complete(context);
        Firebug.Editor.update();
    }
});
}

function EditorJSAutoCompleter(box, completionBox, options)
{
    var ac = new Firebug.JSAutoCompleter(box, completionBox, options);

    this.destroy = Obj.bindFixed(ac.shutdown, ac);
    this.reset = Obj.bindFixed(ac.hide, ac);
    this.complete = Obj.bind(ac.complete, ac);
    this.handleKeyPress = Obj.bind(ac.handleKeyPress, ac);
}

// ********************************************************************************************* //
// Auto-completion helpers

/**
 * Try to find the position at which the expression to be completed starts.
 */
function getExpressionOffset(command)
{
    var bracketCount = 0;

    var start = command.length, instr = false;

    // When completing []-accessed properties, start instead from the last [.
    var lastBr = command.lastIndexOf("[");
    if (lastBr !== -1 && /^" *$/.test(command.substr(lastBr+1)))
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
            else if (!instr && !reJSChar.test(c) && c !== ".")
                break;
        }
    }
    ++i;

    // The 'new' operator has higher precedence than function calls, so, if
    // present, it should be included if the expression contains a parenthesis.
    if (i-4 >= 0 && command.indexOf("(", i) !== -1 && command.substr(i-4, 4) === "new ")
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
    if (lastDot !== -1)
        return lastDot+1;

    return 0;
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

function isFunctionName(expr, pos)
{
    pos -= 9;
    return (pos >= 0 && expr.substr(pos, 9) === "function " &&
            (pos === 0 || !reJSChar.test(expr.charAt(pos-1))));
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
function endingDivIsRegex(expr)
{
    var kwActions = ["throw", "return", "in", "instanceof", "delete", "new",
        "do", "else", "typeof", "void", "yield"];
    var kwCont = ["function", "if", "while", "for", "switch", "catch", "with"];

    var ind = prevNonWs(expr, expr.length), ch = (ind === -1 ? "{" : expr.charAt(ind));
    if (reJSChar.test(ch))
    {
        // Test if the previous word is a keyword usable like 'kw <expr>'.
        // If so, we have a regex, otherwise, we have a division (a variable
        // or literal being divided by something).
        var w = expr.substring(prevWord(expr, ind), ind+1);
        return (kwActions.indexOf(w) !== -1);
    }
    else if (ch === ")")
    {
        // We have a regex in the cases 'if (...) /blah/' and 'function name(...) /blah/'.
        ind = bwFindMatchingParen(expr, ind);
        if (ind === -1)
            return null;
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
    return !(ch === ")" || ch === "{" || ch === "}" || ch === ";");
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

function simplifyExpr(expr)
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
                var re = endingDivIsRegex(ret);
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
            else
            {
                if (reOpenBracket.test(ch))
                    brackets.push(ch);
                else if (reCloseBracket.test(ch))
                {
                    // Check for mismatched brackets
                    if (!brackets.length)
                        return null;
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
function killCompletions(expr, origExpr)
{
    // Make sure there is actually something to complete at the end.
    if (expr.length === 0)
        return true;

    if (reJSChar.test(expr[expr.length-1]) ||
            expr[expr.length-1] === ".")
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
            return true;
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
        if (ind !== -1)
        {
            var stw = prevWord(expr, ind);
            if (expr.substring(stw, ind+1) === "function")
                return true;
            ind = prevNonWs(expr, stw);
            if (ind !== -1 && expr.substring(prevWord(expr, ind), ind+1) === "function")
                return true;
        }
    }
    return false;
}

// Types the autocompletion knows about, some of their non-enumerable properties,
// and the return types of some member functions, included in the Firebug.CommandLine
// object to make it more easily extensible.

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
        // There are also toFixed and valueOf, but they are left out because
        // they steal focus from toString by being shorter (in the case of
        // toFixed), and because they are used very seldom.
        "toExponential": "|String",
        "toPrecision": "|String",
        "toLocaleString": "|String",
        "toString": "|String"
    }
};

var LinkType = {
    "PROPERTY": 0,
    "INDEX": 1,
    "CALL": 2,
    "SAFECALL": 3,
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

function sortUnique(ar)
{
    ar = ar.slice();
    ar.sort();
    var ret = [];
    for (var i = 0; i < ar.length; ++i)
    {
        if (i && ar[i-1] === ar[i])
            continue;
        ret.push(ar[i]);
    }
    return ret;
}

function propChainBuildComplete(out, context, tempExpr, result)
{
    var complete = null, command = null;
    if (tempExpr.fake)
    {
        var name = tempExpr.value.val;
        complete = getFakeCompleteKeys(name);
        if (!getKnownType(name)._fb_ignorePrototype)
            command = name + ".prototype";
    }
    else
    {
        if (typeof result === "string")
        {
            // Strings only have indices as properties, use the fake object
            // completions instead.
            tempExpr.fake = true;
            tempExpr.value = getKnownTypeInfo("String");
            propChainBuildComplete(out, context, tempExpr);
            return;
        }
        else if (FirebugReps.Arr.isArray(result, context.window))
            complete = nonNumericKeys(result);
        else
            complete = Arr.keys(result);
        command = getTypeExtractionExpression(tempExpr.command);
    }

    var done = function()
    {
        if (out.indexCompletion)
        {
            complete = complete.map(function(x)
            {
                x = (out.indexQuoteType === '"') ? Str.escapeJS(x): Str.escapeSingleQuoteJS(x);
                return x + out.indexQuoteType + "]";
            });
        }

        // Properties may be taken from several sources, so filter out duplicates.
        out.complete = sortUnique(complete);
    };

    if (command === null)
    {
        done();
    }
    else
    {
        Firebug.CommandLine.evaluate(command, context, context.thisValue, null,
            function found(result, context)
            {
                if (tempExpr.fake)
                {
                    complete = complete.concat(Arr.keys(result));
                }
                else
                {
                    if (typeof result === "string" && getKnownType(result))
                    {
                        complete = complete.concat(getFakeCompleteKeys(result));
                    }
                }
                done();
            },
            function failed(result, context)
            {
                done();
            }
        );
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
            else if (type === LinkType.INDEX)
            {
                tempExpr.thisCommand = "window";
                tempExpr.command += "[" + link.cont + "]";
            }
            else if (type === LinkType.SAFECALL)
            {
                tempExpr.thisCommand = "window";
                tempExpr.command += "(" + link.origCont + ")";
            }
            else if (type === LinkType.CALL)
            {
                if (link.name === "")
                {
                    // We cannot know about functions without name; try the
                    // heuristic directly.
                    link.type = LinkType.RETVAL_HEURISTIC;
                    evalPropChainStep(step, tempExpr, evalChain, out, context);
                    return;
                }

                funcCommand = getTypeExtractionExpression(tempExpr.thisCommand);
                break;
            }
            else if (type === LinkType.RETVAL_HEURISTIC)
            {
                if (link.origCont !== null &&
                     (link.name.substr(0, 3) === "get" ||
                      (link.name.charAt(0) === "$" && link.cont.indexOf(",") === -1)))
                {
                    // Names beginning with get or $ are almost always getters, so
                    // assume it is a safecall and start over.
                    link.type = LinkType.SAFECALL;
                    evalPropChainStep(step, tempExpr, evalChain, out, context);
                    return;
                }
                funcCommand = "Function.prototype.toString.call(" + tempExpr.command + ")";
                break;
            }
            ++step;
        }

        var func = (funcCommand !== null), command = (func ? funcCommand : tempExpr.command);
        Firebug.CommandLine.evaluate(command, context, context.thisValue, null,
            function found(result, context)
            {
                if (func)
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
                            if (epos !== -1)
                            {
                                rest = rest.substring(0, epos);
                                tempExpr.command = rest + ".prototype";
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
            function failed(result, context) { }
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
                var nextLink = eatProp(preExpr, linkStart+1);
                lastProp = preExpr.substring(linkStart+1, nextLink);
                linkStart = nextLink;
                evalChain.push({"type": LinkType.PROPERTY, "name": lastProp});
            }
            else if (ch === "(")
            {
                // Function call. Save the function name and the arguments if
                // they are safe to evaluate.
                var endCont = matchingBracket(preExpr, linkStart);
                var cont = preExpr.substring(linkStart+1, endCont), origCont = null;
                if (reLiteralExpr.test(cont))
                    origCont = origExpr.substring(linkStart+1, endCont);
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

function autoCompleteEval(context, preExpr, spreExpr, includeCurrentScope)
{
    var out = {};

    out.complete = [];

    try
    {
        if (spreExpr)
        {
            // Complete member variables of some .-chained expression

            // In case of array indexing, remove the bracket and set a flag to
            // escape completions.
            out.indexCompletion = false;
            var len = spreExpr.length;
            if (len >= 2 && spreExpr[len-2] === "[" && spreExpr[len-1] === '"')
            {
                out.indexCompletion = true;
                out.indexQuoteType = preExpr[len-1];
                spreExpr = spreExpr.substr(0, len-2);
                preExpr = preExpr.substr(0, len-2);
            }
            else
            {
                // Remove the trailing dot (if there is one)
                var lastDot = spreExpr.lastIndexOf(".");
                if (lastDot !== -1)
                {
                    spreExpr = spreExpr.substr(0, lastDot);
                    preExpr = preExpr.substr(0, lastDot);
                }
            }

            if (FBTrace.DBG_COMMANDLINE)
                FBTrace.sysout("commandLine.autoCompleteEval pre:'" + preExpr +
                    "' spre:'" + spreExpr + "'.");

            // Don't auto-complete '.'.
            if (spreExpr === "")
                return out.complete;

            evalPropChain(out, spreExpr, preExpr, context);
        }
        else
        {
            // Complete variables from the local scope

            var contentView = Wrapper.getContentView(context.window);
            if (context.stopped && includeCurrentScope)
            {
                out.complete = Firebug.Debugger.getCurrentFrameKeys(context);
            }
            else if (contentView && contentView.Window &&
                contentView.constructor.toString() === contentView.Window.toString())
                // Cross window type pseudo-comparison
            {
                out.complete = Arr.keys(contentView); // return is safe

                // Add some known window properties
                out.complete = out.complete.concat(getFakeCompleteKeys("Window"));
            }
            else  // hopefully sandbox in Chromebug
            {
                out.complete = Arr.keys(context.global);
            }

            // Sort the completions, and avoid duplicates.
            out.complete = sortUnique(out.complete);
        }
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS && FBTrace.DBG_COMMANDLINE)
            FBTrace.sysout("commandLine.autoCompleteEval FAILED", exc);
    }
    return out.complete;
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

const rePositiveNumber = /^[1-9][0-9]*$/;
function nonNumericKeys(map)  // keys will be on user-level window objects
{
    var keys = [];
    try
    {
        for (var name in map)  // enumeration is safe
        {
            if (! (name === "0" || rePositiveNumber.test(name)) )
                keys.push(name);
        }
    }
    catch (exc)
    {
        // Sometimes we get exceptions trying to iterate properties
    }

    return keys;  // return is safe
}

function setCursorToEOL(input)
{
    // textbox version, https://developer.mozilla.org/en/XUL/Property/inputField
    // input.inputField.setSelectionRange(len, len);
    input.setSelectionRange(input.value.length, input.value.length);
}

// ********************************************************************************************* //
// Registration

return Firebug.JSAutoCompleter;

// ********************************************************************************************* //
});
