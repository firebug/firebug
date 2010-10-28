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

var EXPORTED_SYMBOLS = ["Breakpoint"];

// ************************************************************************************************
// Breakpoint

/**
 * Describes a breakpoint in a compilation unit. A breakpoint is specific to a compilation unit and
 * execution context.
 * <p>
 * A breakpoint proceeds through states in its lifecycle.
 * <ul>
 * <li>{@link Breakpoint.PENDING_INSTALL} - created and pending installation in the runtime</li>
 * <li>{@link Breakpoint.FAILED_INSTALL} - failed to install in the runtime</li>
 * <li>{@link Breakpoint.INSTALLED} - installed in the runtime</li>
 * <li>{@link Breakpoint.PENDING_CLEAR} - pending removal from the runtime</li>
 * <li>{@link Breakpoint.FAILED_CLEAR} - failed to clear from the runtime</li>
 * <li>{@link Breakpoint.CLEARED} - cleared from the runtime</li>
 * </ul>
 * </p>
 * 
 * @constructor
 * @param compilationUnit the {@link CompilationUnit} unit that contains this breakpoint
 * @param lineNumber the source code line number the breakpoint is set on
 * @type Breakpoint
 * @return a new Breakpoint
 * @version 1.0
 */
function Breakpoint(compilationUnit, lineNumber)
{
    this.compilationUnit = compilationUnit;
    this.lineNumber = lineNumber;
    this.state = this.PENDING_INSTALL;
}

// ************************************************************************************************
// API

/**
 * Breakpoint state indicating a breakpoint has been created and is pending installation.
 * @constant 
 */
Breakpoint.prototype.PENDING_INSTALL = 1;
/**
 * Breakpoint state indicating a breakpoint failed to install.
 * @constant 
 */
Breakpoint.prototype.FAILED_INSTALL = 2;
/**
 * Breakpoint state indicating a breakpoint has been installed.
 * @constant 
 */
Breakpoint.prototype.INSTALLED = 3;
/**
 * Breakpoint state indicating a breakpoint pending a clear. 
 * @constant 
 */
Breakpoint.prototype.PENDING_CLEAR = 4;
/**
 * Breakpoint state indicating a clear request failed.
 * @constant 
 */
Breakpoint.prototype.FAILED_CLEAR = 5;
/**
 * Breakpoint state indicating a breakpoint has been cleared.
 * @constant 
 */
Breakpoint.prototype.CLEARED = 6;

/**
 * Returns the compilation unit this breakpoint was created in.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * 
 * @function
 * @returns a {@link CompilationUnit}
 */
Breakpoint.prototype.getCompilationUnit = function()
{
    return this.compilationUnit;
};

/**
 * Requests to clear this breakpoint from its compilation unit asynchronously. The clear
 * request will be sent to the browser and an <code>onToggleBreakpoint</code> event will
 * be sent by the browser when the breakpoint is cleared.
 * <p>
 * <ul>
 * <li>TODO: onToggleBreakpoint event is not spec'd - is this the intended use?</li>
 * <li>TODO: breakpoint does not exist</li>
 * <li>TODO: compilation unit no longer exists in the browser</li>
 * </ul>
 * </p>
 * @function
 */
Breakpoint.prototype.clear = function()
{
    // TODO:
};

/**
 * Returns the current state of this breakpoint - one of the state constants defined
 * by this object.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @return breakpoint state
 */
Breakpoint.prototype.getState = function() {
	return this.state;
}

/**
 * Returns the source code line number this breakpoint was created on.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns line number
 * 
 */
Breakpoint.prototype.getLineNumber = function()
{
    return this.lineNumber;
};

// ************************************************************************************************
// Private 

/**
 * Implementations must call this method when a breakpoint gets installed in the browser.
 * Notification will be sent to registered listeners that the breakpoint has been installed.
 * Updates the installed property of this breakpoint. This method should only be called once when
 * a breakpoint becomes installed.
 * 
 * @function
 */
Breakpoint.prototype._installed = function()
{
    if (this.state === this.PENDING_INSTALL)
    {
    	this.state = this.INSTALLED;
        this.getCompilationUnit().getBrowserContext().getBrowser()._dispatch("onToggleBreakpoint", [this]);	
    }
};

/**
 * Implementations must call this method when a breakpoint is cleared from the browser.
 * Notification will be sent to registered listeners that the breakpoint has been cleared.
 * This method should only be called once when a breakpoint is cleared.
 * 
 * @function
 */
Breakpoint.prototype._cleared = function()
{
    if (this.state != this.CLEARED)
    {
        this.state = this.CLEARED;
        this.getCompilationUnit().getBrowserContext().getBrowser()._dispatch("onToggleBreakpoint", [this]);
    }
};

/**
 * Implementations must call this method when a breakpoint fails to install in the browser.
 * Notification will be sent to registered listeners that breakpoint installation has failed.
 * Updates breakpoint state. This method should only be called once when a breakpoint fails to
 * install.
 * 
 * @function
 */
Breakpoint.prototype._failedInstall = function()
{
    if (this.state === this.PENDING_INSTALL)
    {
        this.state = this.FAILED_INSTALL;
        this.getCompilationUnit().getBrowserContext().getBrowser()._dispatch("onBreakpointError", [this]);
    }
};

/**
 * Implementations must call this method when a breakpoint fails to clear from the browser.
 * Notification will be sent to registered listeners that breakpoint clear has failed.
 * Updates breakpoint state. This method should only be called once when a breakpoint fails to
 * clear.
 * 
 * @function
 */
Breakpoint.prototype._failedClear = function()
{
    if (this.state === this.PENDING_CLEAR)
    {
        this.state = this.FAILED_CLEAR;
        this.getCompilationUnit().getBrowserContext().getBrowser()._dispatch("onBreakpointError", [this]);
    }
};

// ************************************************************************************************
// CommonJS

exports = Breakpoint;
