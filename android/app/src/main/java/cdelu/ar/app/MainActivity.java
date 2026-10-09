package cdelu.ar.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(TargetSharePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
