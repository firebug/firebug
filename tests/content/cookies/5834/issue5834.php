<?php
    $longValue = "";
    $longValueUTF8 = "";

    for ($i=0; $i<1200; $i++)
      $longValue .= "x";

    for ($i=0; $i<150; $i++)
      $longValueUTF8 .= "☺";

    $time = time() + 86400;
    $dir = dirname($_SERVER['SCRIPT_NAME']);

    setcookie("TestCookie5834-1", "Value", $time, $dir);
    setcookie("TestCookie5834-2", "Value ☺", $time, $dir);
    setcookie("TestCookie5834-3", $longValue, $time, $dir);
    setcookie("TestCookie5834-4", $longValueUTF8, $time, $dir);
?>

<!DOCTYPE html>
<html>
    <head>
        <title>Issue 5834: Add infotip for cookie size</title>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
        <link href="../../_common/testcase.css" type="text/css" rel="stylesheet"/>
    </head>
    <body>
        <header>
            <h1><a href="http://code.google.com/p/fbug/issues/detail?id=5834">Issue 5834</a>: Add infotip for cookie size</h1>
        </header>
        <div>
            <section id="description">
                <h3>Steps to reproduce</h3>
                <ol>
                    <li>Open Firebug</li>
                    <li>Enable and switch to the <em>Cookies</em> panel</li>
                    <li>
                        Reload the page<br/>
                        <span class="ok">&rArr; Four cookies should be listed (<code>TestCookie5834-1</code> to <code>TestCookie5834-4</code>)</span>
                    </li>
                    <li>Hover the size value of each cookie</li>
                </ol>
                <h3>Expected result</h3>
                <ul>
                    <li>
                        An infotip should be displayed for each value:<br/>
TestCookie5834-1:
                        <code>
Size 21 B
                        </code><br/>
TestCookie5834-2:
                        <code>
Size 23 B
Raw Size 31 B
                        </code><br/>
TestCookie5834-3:
                        <code>
Size 1.2 KB (1,216 B)
                        </code><br/>
TestCookie5834-4:
                        <code>
Size 166 B
Raw Size 1.3 KB (1,366 B)
                        </code>
                    </li>
                </ul>
            </section>
            <footer>Sebastian Zartner, sebastianzartner@gmail.com</footer>
        </div>
    </body>
</html>
