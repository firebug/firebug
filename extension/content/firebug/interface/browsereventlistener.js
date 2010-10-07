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
 * Describes the event listener functions supported by a {@link Browser}. 
 * 
 * @constructor
 * @type BrowserEventListener
 * @return a new {@link BrowserEventListener}
 * @version 1.0
 */
function BrowserEventListener() {
	
	/**
	 * Notification that execution has suspended in the specified
	 * compilation unit.
	 * 
	 * @function
	 * @param compilationUnit the {@link CompilationUnit} execution has suspended in
	 * @param lineNumber the line number execution has suspended at 
	 */
	onBreak: function(compilationUnit, lineNumber) {}

	/**
	 * TODO:
	 */
	onConsoleDebug: function() {}
	
	/**
	 * TODO:
	 */
	onConsoleError: function() {}
		
	/**
	 * Notification the specified information messages have been logged.
	 * 
	 * @function
	 * @param browserContext the {@link BrowserContext} the messages were logged from
	 * @param messages array of messages as {@link String}'s
	 */
	onConsoleInfo: function(browserContext, messages) {}
	
	/**
	 * Notification the specified messages have been logged.
	 * 
	 * @function
	 * @param browserContext the {@link BrowserContext} the messages were logged from
	 * @param messages array of messages as {@link String}'s
	 */
	onConsoleLog: function(browserContext, messages) {}
	
	/**
	 * Notification the specified warning messages have been logged.
	 * 
	 * @function
	 * @param browserContext the {@link BrowserContext} the messages were logged from
	 * @param messages array of messages as {@link String}'s
	 */
	onConsoleWarn: function(browserContext, messages) {}
	
	/**
	 * Notification the specified browser context has been created. This notification
	 * is sent when a new context is created and before any scripts are compiled in
	 * the new context.
	 * 
	 * @function
	 * @param browserContext the {@link BrowserContext} that was created
	 */
	onContextCreated: function(browserContext) {}
	
	/**
	 * Notification the focus browser context has been changed.
	 * 
	 * @function
	 * @param fromContext the previous {@link BrowserContext} that had focus or <code>null</code>
	 * @param toContext the {@link BrowserContext} that now has focus or <code>null</code>
	 */
	onContextChanged: function(fromContext, toContext) {}
	
	/**
	 * Notification the specified browser context has been destroyed.
	 * 
	 * @function
	 * @param browserContext the {@link BrowserContext} that was destroyed
	 */
	onContextDestroyed: function(browserContext) {}
	
	/**
	 * Notification the specified browser context has completed loading.
	 * 
	 * @function
	 * @param browserContext the {@link BrowserContext} that has completed loading
	 */
	onContextLoaded: function(browserContext) {}
	
	/**
	 * Notification the connection to the remote browser has been closed.
	 * 
	 * @function
	 * @param browser the {@link Browser} that has been disconnected
	 */
	onDisconnect: function(browser) {}
	
	/**
	 * TODO:
	 */
	onInspectNode: function() {}
	
	/**
	 * Notification the specified execution context has resumed execution.
	 * 
	 * @function
	 * @param javaScriptContext the {@link JavaScriptContext} that has resumed
	 */
	onResume: function(javaScriptContext) {}
		
	/**
	 * Notification the specified compilation unit has been compiled (loaded)
	 * in its browser context.
	 * 
	 * @function
	 * @param compilationUnit the {@link CompilationUnit} that has been compiled
	 */
	onScript: function(compilationUnit) {}
	
	/**
	 * Notification the specified breakpoint has been installed or cleared.
	 * 
	 * @function
	 * @param breakpoint the {@link Breakpoint} that has been toggled
	 */
	onToggleBreakpoint: function(breakpoint) {}
	
}