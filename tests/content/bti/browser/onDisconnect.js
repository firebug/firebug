
/**
 * Test event listener call back for #onDisconnect
 *
 * When the browser is disconnected a call back should be triggered
 */

function runTest()
{
    var browser = new FW.Firebug.BTI.Browser(); // TODO
    browser.addEventListener("onDisconnect", function(aBrowser)
    {
        FBTest.ok(browser == aBrowser, "Disconnect call back is for wrong browser");
        FBTest.testDone();
    });
    FBTest.progress("onDisconnect, disconnecting");
    browser.disconnect();
}
