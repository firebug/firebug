function runTest() {
  function testRE(reToken, text, expectedIndex, expectedLastIndex) {
    FBTest.progress("Testing RE: " + reToken + " text: " + text + " index: " + expectedIndex + " lastIndex: " + expectedLastIndex);
    var result = re.exec(text);
    FBTest.compare(expectedLastIndex, re.lastIndex, "Last index matches");
    if (expectedIndex >= 0) {
      FBTest.compare(1, result.length, "Array length correct");
      FBTest.compare(reToken, result[0], "Proper token returned");
      FBTest.compare(expectedIndex, result.index, "Result index matches");
      FBTest.compare(text, result.input, "Input text matches");
    } else {
      FBTest.compare(null, result, "No result returned");
    }
  }

  // Forward, case sensitive, single char
  var re = new FW.FBL.LiteralRegExp("t", false, true);
  FBTest.progress("Forward, case sensitive, single char");
  testRE("t", "ttatt", 0, 1);
  testRE("t", "ttatt", 1, 2);
  testRE("t", "ttatt", 3, 4);
  testRE("t", "ttatt", 4, 5);
  testRE("", "ttatt", -1, 0);

  testRE("", "aaaaaaa", -1, 0);

  var re = /t/g;
  FBTest.progress("Native, forward, case sensitive, single char");
  testRE("t", "ttatt", 0, 1);
  testRE("t", "ttatt", 1, 2);
  testRE("t", "ttatt", 3, 4);
  testRE("t", "ttatt", 4, 5);
  testRE("", "ttatt", -1, 0);

  testRE("", "aaaaaaa", -1, 0);

  // Reverse, case sensitive, single char
  re = new FW.FBL.LiteralRegExp("t", true, true);
  FBTest.progress("Reverse, case sensitive, single char");
  testRE("t", "ttatt", 4, -1);
  testRE("t", "ttatt", 3, -2);
  testRE("t", "ttatt", 1, -4);
  testRE("t", "ttatt", 0, -5);
  testRE("", "ttatt", -1, 0);

  testRE("", "aaaaaaa", -1, 0);

  // Forward, case sensitive
  re = new FW.FBL.LiteralRegExp("te(st", false, true);
  FBTest.progress("Forward, case sensitive");
  testRE("te(st", "te(st test Te(st te(st", 0, 5);
  testRE("te(st", "te(st test Te(st te(st", 17, 22);
  testRE("", "te(st test Te(st te(st", -1, 0);

  testRE("", "test test test", -1, 0);

  // Run the native regex through the same test to verify that we have
  // some similarity to the current impl
  re = /te\(st/g;
  FBTest.progress("Forward, case sensitive");
  testRE("te(st", "te(st test Te(st te(st", 0, 5);
  testRE("te(st", "te(st test Te(st te(st", 17, 22);
  testRE("", "te(st test Te(st te(st", -1, 0);

  testRE("", "test test test", -1, 0);


  // Reverse, case sensitive
  FBTest.progress("Reverse, case sensitive");
  re = new FW.FBL.LiteralRegExp("te(st", true, true);
  testRE("te(st", "te(st test Te(st te(st", 17, -5);
  testRE("te(st", "te(st test Te(st te(st", 0, -22);
  testRE("", "te(st test Te(st te(st", -1, 0);

  testRE("", "test test test", -1, 0);

  // Forward, case insensitive
  FBTest.progress("Forward, case insensitive");
  re = new FW.FBL.LiteralRegExp("te(st", false, false);
  testRE("te(st", "te(st test Te(st te(st", 0, 5);
  testRE("Te(st", "te(st test Te(st te(st", 11, 16);
  testRE("te(st", "te(st test Te(st te(st", 17, 22);
  testRE("", "te(st test Te(st te(st", -1, 0);

  testRE("te(st", "test test test", -1, 0);

  FBTest.progress("Native, forward, case insensitive");
  re = /te\(st/gi;
  testRE("te(st", "te(st test Te(st te(st", 0, 5);
  testRE("Te(st", "te(st test Te(st te(st", 11, 16);
  testRE("te(st", "te(st test Te(st te(st", 17, 22);
  testRE("", "te(st test Te(st te(st", -1, 0);

  testRE("te(st", "test test test", -1, 0);

  // Reverse, case insensitive
  FBTest.progress("Reverse, case insensitive");
  re = new FW.FBL.LiteralRegExp("te(st", true, false);
  testRE("te(st", "te(st test Te(st te(st", 17, -5);
  testRE("Te(st", "te(st test Te(st te(st", 11, -11);
  testRE("te(st", "te(st test Te(st te(st", 0, -22);
  testRE("", "te(st test Te(st te(st", -1, 0);

  testRE("", "test test test", -1, 0);

  FBTest.testDone();
}