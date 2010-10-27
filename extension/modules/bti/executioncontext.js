/**
 * Software License Agreement (BSD License)
 * 
 * Copyright (c) 2010 IBM Corporation.
 * All rights reserved.
 * 
 * Redistribution and use of this software in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 * 
 * * Redistributions of source code must retain the above
 *   copyright notice, this list of conditions and the
 *   following disclaimer.
 * 
 * * Redistributions in binary form must reproduce the above
 *   copyright notice, this list of conditions and the
 *   following disclaimer in the documentation and/or other
 *   materials provided with the distribution.
 * 
 * * Neither the name of IBM nor the names of its
 *   contributors may be used to endorse or promote products
 *   derived from this software without specific prior
 *   written permission of IBM.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 * FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
 * IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
 * OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

// ************************************************************************************************
// Module

var EXPORTED_SYMBOLS = ["JavaScriptContext"];

// ************************************************************************************************
// JavaScriptContext

/**
 * Describes the execution of JavaScript within a browser context. An execution
 * context pertains to one or more compilation units (JavaScript scripts)
 * that may contain breakpoints. An execution context can suspend and resume
 * and provides stack frames when suspended.
 * 
 * @constructor
 * @param browser the browser context the execution context is contained in
 * @type JavaScriptContext
 * @return a new JavaScriptContext
 * @version 1.0
 */
function JavaScriptContext(browserContext)
{
    this.browserContext= browserContext;
    this.is_suspended = false;
    this.frames = [];
}

// ************************************************************************************************
// API

/**
 * Returns the browser context this execution context is contained in.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns a {@link BrowserContext}
 */
JavaScriptContext.prototype.getBrowserContext = function()
{
    return this.browserContext;
};

/**
 * Returns whether this execution context is currently suspended.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns a boolean indicating whether this execution context is currently suspended
 */
JavaScriptContext.prototype.isSuspended = function()
{
    return this.is_suspended;
};

/**
 * Returns whether this execution context has terminated. Returns <code>true</code>
 * if this execution context has terminated, otherwise <code>false</code>.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns a boolean indicating whether this execution context has terminated
 */
JavaScriptContext.prototype.isTerminated = function()
{
    return !this.getBrowserContext().exists();
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
JavaScriptContext.prototype.getBreakpoint = function()
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
JavaScriptContext.prototype.suspend = function()
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
JavaScriptContext.prototype.resume = function()
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
JavaScriptContext.prototype.getStackFrames = function(listener)
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
JavaScriptContext.prototype._suspended = function(compilationUnit, lineNumber)
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
JavaScriptContext.prototype._resumed = function()
{
    if (this.is_suspended)
    {
        this.is_suspended = false;
        this.getBrowserContext().getBrowser()._dispatch("onResume", [this]);
    }
};

// ************************************************************************************************
// CommonJS

exports = JavaScriptContext;
