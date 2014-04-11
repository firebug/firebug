function runTest()
{
    // Test cropping when no alternative text is specified
    verifyResult("abcdefghijklmnopqrstuvwxyz", "abcdefghijklmnopqrstuvwxyz", 0);
    verifyResult("abcdefgh", "abcdefgh", 10);
    verifyResult("abcdefgh", "abcdefgh", 8);
    verifyResult("ab...gh", "abcdefgh", 7);
    verifyResult("ab...h", "abcdefgh", 6);
    verifyResult("a...h", "abcdefgh", 5);
    verifyResult("a...", "abcdefgh", 4);
    verifyResult("a...", "abcdefgh", 3);

    // Test cropping when 'stringCropLength' is used
    var prefOrigValue = FBTest.getPref("stringCropLength");
    FBTest.setPref("stringCropLength", 6);
    verifyResult("abcdef", "abcdef");
    verifyResult("ab...h", "abcdefgh");
    FBTest.setPref("stringCropLength", prefOrigValue);

    // Test cropping when an alternative text is specified
    verifyResult("abcdefghijklmnopqrstuvwxyz", "abcdefghijklmnopqrstuvwxyz", 0, "....");
    verifyResult("abcdefgh", "abcdefgh", 10, "....");
    verifyResult("abcdefgh", "abcdefgh", 8, "....");
    verifyResult("ab....h", "abcdefgh", 7, "....");
    verifyResult("a....h", "abcdefgh", 6, "....");
    verifyResult("a....", "abcdefgh", 5, "....");
    verifyResult("a....", "abcdefgh", 4, "....");

    verifyResult("abcdefghijklmnopqrstuvwxyz", "abcdefghijklmnopqrstuvwxyz", 0, "\u2026");
    verifyResult("abcdefgh", "abcdefgh", 10, "\u2026");
    verifyResult("abcdefgh", "abcdefgh", 8, "\u2026");
    verifyResult("abc\u2026fgh", "abcdefgh", 7, "\u2026");
    verifyResult("abc\u2026gh", "abcdefgh", 6, "\u2026");
    verifyResult("ab\u2026gh", "abcdefgh", 5, "\u2026");
    verifyResult("ab\u2026h", "abcdefgh", 4, "\u2026");

    FBTest.testDone();
}

function verifyResult(expected, text, limit, alterText)
{
    var result = FW.FBL.cropString(text, limit, alterText);
    FBTest.compare(expected, result, 
        "String '" + text + "' must " + (expected === text ? "not be" : "be properly") +
        " cropped when limit is set to " + (limit || FBTest.getPref("stringCropLength")));
}