
/**
 * Test for Browser#isConnected() and #disconnect()
 *
 * Test that the browser is connected and can be disconnected
 */

function runTest()
{
    var browser = new FW.Firebug.BTI.Browser(); // TODO
    if (browser.isConnected())
    {
        browser.disconnect();
        FBTest.ok(!browser.isConnected(), "browser should be disconnected");
    }
    else
    {
        FBTest.ok(false, "browser should be connected");
    }
    FBTest.testDone();
}
