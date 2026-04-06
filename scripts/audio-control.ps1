[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Command,

    [Parameter(Position = 1)]
    [string]$Value
)

$source = @"
using System;
using System.Runtime.InteropServices;

namespace AudioDeck {
    [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    [ComImport]
    internal class MMDeviceEnumeratorComObject {
    }

    internal enum EDataFlow {
        eRender,
        eCapture,
        eAll,
        EDataFlow_enum_count
    }

    internal enum ERole {
        eConsole,
        eMultimedia,
        eCommunications,
        ERole_enum_count
    }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceEnumerator {
        int NotImpl1();
        [PreserveSig]
        int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice endpoint);
        int NotImpl2();
        int NotImpl3();
        int NotImpl4();
        int NotImpl5();
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDevice {
        [PreserveSig]
        int Activate(ref Guid iid, int dwClsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
    }

    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioEndpointVolume {
        int RegisterControlChangeNotify(IntPtr notify);
        int UnregisterControlChangeNotify(IntPtr notify);
        int GetChannelCount(out uint channelCount);
        int SetMasterVolumeLevel(float levelDb, Guid eventContext);
        int SetMasterVolumeLevelScalar(float level, Guid eventContext);
        int GetMasterVolumeLevel(out float levelDb);
        int GetMasterVolumeLevelScalar(out float level);
        int SetChannelVolumeLevel(uint channelNumber, float levelDb, Guid eventContext);
        int SetChannelVolumeLevelScalar(uint channelNumber, float level, Guid eventContext);
        int GetChannelVolumeLevel(uint channelNumber, out float levelDb);
        int GetChannelVolumeLevelScalar(uint channelNumber, out float level);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool isMuted, Guid eventContext);
        int GetMute(out bool isMuted);
        int GetVolumeStepInfo(out uint step, out uint stepCount);
        int VolumeStepUp(Guid eventContext);
        int VolumeStepDown(Guid eventContext);
        int QueryHardwareSupport(out uint hardwareSupportMask);
        int GetVolumeRange(out float volumeMindB, out float volumeMaxdB, out float volumeIncrementdB);
    }

    public static class AudioManager {
        private static IAudioEndpointVolume GetAudioEndpointVolume() {
            var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
            IMMDevice device;
            Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out device));

            var iid = typeof(IAudioEndpointVolume).GUID;
            object endpointVolumeObject;
            Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out endpointVolumeObject));
            return (IAudioEndpointVolume)endpointVolumeObject;
        }

        public static float GetMasterVolume() {
            float level;
            Marshal.ThrowExceptionForHR(GetAudioEndpointVolume().GetMasterVolumeLevelScalar(out level));
            return level;
        }

        public static bool GetMute() {
            bool isMuted;
            Marshal.ThrowExceptionForHR(GetAudioEndpointVolume().GetMute(out isMuted));
            return isMuted;
        }

        public static void SetMasterVolume(float level) {
            if (level < 0f) {
                level = 0f;
            }

            if (level > 1f) {
                level = 1f;
            }

            Marshal.ThrowExceptionForHR(GetAudioEndpointVolume().SetMasterVolumeLevelScalar(level, Guid.Empty));
        }

        public static void SetMute(bool isMuted) {
            Marshal.ThrowExceptionForHR(GetAudioEndpointVolume().SetMute(isMuted, Guid.Empty));
        }
    }
}
"@

if (-not ("AudioDeck.AudioManager" -as [type])) {
    Add-Type -TypeDefinition $source -Language CSharp
}

function Get-State {
    $volume = [Math]::Round(([AudioDeck.AudioManager]::GetMasterVolume() * 100), 0)
    $muted = [AudioDeck.AudioManager]::GetMute()

    @{
        volume = [int]$volume
        muted = [bool]$muted
    } | ConvertTo-Json -Compress
}

switch ($Command.ToLowerInvariant()) {
    "get" {
        Get-State
        break
    }
    "set-volume" {
        $intValue = 0

        if (-not [int]::TryParse($Value, [ref]$intValue)) {
            throw "Volume value must be an integer between 0 and 100."
        }

        if ($intValue -lt 0 -or $intValue -gt 100) {
            throw "Volume value must be an integer between 0 and 100."
        }

        [AudioDeck.AudioManager]::SetMasterVolume($intValue / 100.0)
        Get-State
        break
    }
    "set-mute" {
        $muted = $false

        switch ($Value.ToLowerInvariant()) {
            "true" { $muted = $true }
            "false" { $muted = $false }
            default { throw "Mute value must be 'true' or 'false'." }
        }

        [AudioDeck.AudioManager]::SetMute($muted)
        Get-State
        break
    }
    default {
        throw "Unsupported command: $Command"
    }
}
