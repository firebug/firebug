// Tests for StorageService module
Components.utils.import("resource://signature/KeyService.js");

function runTest() {
    FBTest.progress("Testing KeyService");

    var name = "testSignatureOnly";

    var testKey = KeyService.createKeyPair(name);

    FBTrace.sysout("testKey ", testKey);
    FBTest.compare(name, testKey.getName(), "The new key's name must be correct");

    FBTest.testDone();

}

