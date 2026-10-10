package cdelu.ar.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "TargetShare")
public class TargetSharePlugin extends Plugin {
    @PluginMethod
    public void openFacebookPage(PluginCall call) {
        String url = call.getString("url", "");
        Uri uri = Uri.parse(url);
        String path = uri.getPath();
        if (!"https".equalsIgnoreCase(uri.getScheme())
                || !"www.facebook.com".equalsIgnoreCase(uri.getHost())
                || !("/anormalia22".equals(path) || "/anormalia22/".equals(path))) {
            call.reject("La URL de Facebook no es válida", "INVALID_URL");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.setPackage("com.facebook.katana");
        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("La aplicación de Facebook no está instalada", "APP_NOT_AVAILABLE", error);
        } catch (Exception error) {
            call.reject("No se pudo abrir Facebook", "OPEN_FAILED", error);
        }
    }

    @PluginMethod
    public void shareTo(PluginCall call) {
        String target = call.getString("target", "");
        String url = call.getString("url", "");
        String packageName;

        switch (target) {
            case "facebook":
                packageName = "com.facebook.katana";
                break;
            case "whatsapp":
                packageName = "com.whatsapp";
                break;
            case "x":
                packageName = "com.twitter.android";
                break;
            default:
                call.reject("Destino de compartir no reconocido", "INVALID_TARGET");
                return;
        }

        if (url.isEmpty()) {
            call.reject("Falta el enlace para compartir", "MISSING_URL");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_SEND);
        intent.setType("text/plain");
        intent.putExtra(Intent.EXTRA_TEXT, url);
        intent.setPackage(packageName);

        try {
            getActivity().startActivity(intent);
            JSObject result = new JSObject();
            result.put("target", target);
            call.resolve(result);
        } catch (ActivityNotFoundException error) {
            call.reject("La aplicación no está instalada o no acepta enlaces compartidos", "APP_NOT_AVAILABLE", error);
        } catch (Exception error) {
            call.reject("No se pudo abrir la aplicación para compartir", "SHARE_FAILED", error);
        }
    }
}
