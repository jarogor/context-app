<script lang="ts">
  interface Props {
    src: string;
    title: string;
  }

  let { src, title }: Props = $props();
</script>

<iframe class="plugin-frame" {src} {title}></iframe>

<style>
  .plugin-frame {
    width: 100%;
    min-height: 100vh;
    border: 0;
    display: block;
  }
</style>
