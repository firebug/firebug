function runTest()
{
    // A message displayed within Firebug tracing console.
    FBTest.sysout("This is a tracing message");

    // A message displayed under the test within Firebug test console.
    FBTest.progress("This is a progress message");

    // Verification
    FBTest.ok(true, "This is a positive verification");
    //FBTest.ok(false, "This is a negative verification");

    // Verification
    FBTest.compare("Expected", "Expected", "Compare test (positive)");
    //FBTest.compare("Expected", "Actual", "Compare test (negative)");

    FBTest.testDone();
}
