/* See license.txt for terms of usage */

// ************************************************************************************************
// Module

var EXPORTED_SYMBOLS = ["JavaScriptStack"];

// ************************************************************************************************
// JavaScriptStack

/**
 * Describes the execution of JavaScript within a browser context. A Stack
 * can be suspended, then provide stack frames, and then be resumed.
 *
 * @constructor
 * @type JavaScriptStack
 * @return a new JavaScriptStack
 * @version 1.0
 */
function JavaScriptStack()
{
    this.is_suspended = false;
    this.frames = [];
}


// ************************************************************************************************
//




// ************************************************************************************************
// Operations on JavaScriptStack objects


/**
 * Returns whether this execution context is currently suspended.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns a boolean indicating whether this execution context is currently suspended
 */
JavaScriptStack.prototype.isSuspended = function()
{
    return this.is_suspended;
};

/**
 * Returns the breakpoint this execution context is currently suspended at
 * or <code>null</code> if none.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns the {@link Breakpoint} this execution context is suspended at or <code>null</code>
 */
JavaScriptStack.prototype.getBreakpoint = function()
{
    // TODO:
};

/**
 * Requests to suspend this execution context asynchronously iff this context is in a running
 * state. The request will be sent to the browser and an <code>onBreak</code> event will be
 * sent asynchronously by the {@link Browser} when the underlying execution context suspends.
 *
 * @function
 */
JavaScriptStack.prototype.suspend = function()
{
    //TODO:
};

/**
 * Requests to resume this execution context asynchronously iff this context is in a suspended
 * state. The request will be sent to the browser and an <code>onResume</code> event will be
 * sent asynchronously by the {@link Browser} when the underlying execution context resumes.
 *
 * @function
 */
JavaScriptStack.prototype.resume = function()
{
    //TODO:
};

/**
 * Requests all frames in this execution context asynchronously. Stack frames are only available
 * when an execution context is suspended. Stack frames will be retrieved from the browser (if required) and
 * reported to the listener function when available. The listener function may be called before or
 * after this function returns. If this execution context is not suspended an empty array is reported.
 *
 * @function
 * @param listener a function that accepts an array of {@link StackFrame}'s.
 */
JavaScriptStack.prototype.getStackFrames = function(listener)
{
    // TODO:
};

// ************************************************************************************************
// Private

/**
 * Sets this execution context as currently suspended. Fires notification
 * of the suspend to registered listeners. Subclasses may call this method
 * when a suspend occurs.
 * <p>
 * Has no effect if this execution context is already suspended.
 * </p>
 *
 * @function
 * @param compilationUnit the compilation unit where the suspend occurred
 * @param lineNumber the line number the suspend occurred at
 */
JavaScriptStack.prototype._suspended = function(compilationUnit, lineNumber)
{
    if (!this.is_suspended)
    {
        this.is_suspended = true;
        this.getBrowserContext().getBrowser()._dispatch("onBreak", [compilationUnit, lineNumber]);
    }
};

/**
 * Sets this execution context as currently running. Fires notification
 * of the resume to registered listeners. Subclasses may call this method
 * when a resume occurs.
 * <p>
 * Has no effect if this execution context is already running.
 * </p>
 *
 * @function
 */
JavaScriptStack.prototype._resumed = function()
{
    if (this.is_suspended)
    {
        this.is_suspended = false;
        this.getBrowserContext().getBrowser()._dispatch("onResume", [this]);
    }
};

// ************************************************************************************************
// CommonJS

exports = JavaScriptStack;
