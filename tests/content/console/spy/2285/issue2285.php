<?php
set_time_limit(300);
header('Content-type: multipart/x-mixed-replace;boundary=NEXTPART');
print "\n--NEXTPART\n";
for ($i = 0; $i < 4; $i++) {
  print "Content-type: text/plain\n\n";
  print "Part$i+";
  print "--NEXTPART\n";
  ob_flush();
  flush();
    sleep(1);
}
?>