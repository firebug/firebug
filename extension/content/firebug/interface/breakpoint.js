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

/**
 * Describes a breakpoint in a compilation unit. A breakpoint is specific to a compilation unit and
 * execution context.
 * <p>
 * A breakpoint proceeds through states in its lifecycle.
 * <table border="1">
 *   <tr>
 *     <th>State</th>
 *     <th>isInstalled()</th>
 *     <th>isCleared()</th>
 *   </tr>
 *   <tr>
 *     <td>Created, but not yet installed</td>
 *     <td>false</td>
 *     <td>false</td>
 *   </tr>
 *   <tr>
 *     <td>Created and installed</td>
 *     <td>true</td>
 *     <td>false</td>
 *   </tr>
 *   <tr>
 *     <td>Cleared, but not yet uninstalled</td>
 *     <td>true</td>
 *     <td>true</td>
 *   </tr>
 *   <tr>
 *     <td>Cleared and uninstalled</td>
 *     <td>false</td>
 *     <td>true</td>
 *   </tr>
 * </table>
 * </p>
 * 
 * @constructor
 * @param compilationUnit the {@link CompilationUnit} unit that contains this breakpoint
 * @param lineNumber the source code line number the breakpoint is set on
 * @type Breakpoint
 * @return a new Breakpoint
 * @version 1.0
 */
function Breakpoint(compilationUnit, lineNumber) {
	this.compilationUnit = compilationUnit;
	this.lineNumber = lineNumber;
	this.installed = false;
	this.cleared = false;
}

// ---- API ----

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
Breakpoint.prototype.getCompilationUnit = function() {
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
Breakpoint.prototype.clear = function() {
	// TODO:
};

/**
 * Returns whether this breakpoint is installed in its {@link CompilationUnit}.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns <code>true</code> if the breakpoint is installed
 *  and <code>false</code> if it has been cleared
 */
Breakpoint.prototype.isInstalled = function() {
	return this.installed;
};

/**
 * Returns whether this breakpoint has been cleared. A breakpoint is considered cleared
 * as soon as its clear function has been called regardless of the browser's knowledge of
 * the clear.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns whether this breakpoint has been cleared
 */
Breakpoint.prototype.isCleared = function() {
	return this.cleared;
};

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
Breakpoint.prototype.getLineNumber = function() {
	return this.lineNumber;
};

// ---- PRIVATE ---- 

/**
 * Implementations must call this method when a breakpoint gets installed in the browser.
 * Notification will be sent to registered listeners that the breakpoint has been installed.
 * Updates the installed property of this breakpoint. This method should only be called once when
 * a breakpoint becomes installed.
 * 
 * @function
 */
Breakpoint.prototype._installed = function() {
	if (!this.installed) {
		this.installed = true;
		this.getCompilationUnit().getBrowserContext().getBrowser()._dispatch("onToggleBreakpoint", [this]);	
	}
}

/**
 * Implementations must call this method when a breakpoint is cleared from the browser.
 * Notification will be sent to registered listeners that the breakpoint has been cleared.
 * Updates the installed and cleared properties of this breakpoint. This method should only
 * be called once when a breakpoint is cleared.
 * 
 * @function
 */
Breakpoint.prototype._cleared = function() {
	if (!this.cleared) {
		this.cleared = true;
		this.getCompilationUnit().getBrowserContext().getBrowser()._dispatch("onToggleBreakpoint", [this]);
	}
}